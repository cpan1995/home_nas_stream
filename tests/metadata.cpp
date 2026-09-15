#include "library.h"
#include <QTest>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QProcess>
#include <QFile>
#include <QDir>
#include <QTimer>
#include <QJsonDocument>

class FakeTmdb : public TmdbClient {
public:
    FakeTmdb() : TmdbClient("test-token") {}
    QList<QJsonObject> replies;
    QStringList calls;
protected:
    void request(const QString &path, const QUrlQuery &query, Done done) override {
        calls << path + "?" + query.toString();
        auto response = replies.isEmpty() ? QJsonObject() : replies.takeFirst();
        QTimer::singleShot(0, this, [response, done] { done(response, !response.isEmpty()); });
    }
};

static QJsonObject candidate(int id, QString title, QString date) {
    return {{"id", id}, {"title", title}, {"release_date", date}};
}
static QJsonObject found() { return {{"results", QJsonArray{candidate(348, "Alien", "1979-05-25")}}, {"total_pages", 1}}; }
static QJsonObject details() {
    auto data = candidate(348, "Alien", "1979-05-25");
    data["overview"] = "A science-fiction film.";
    data["poster_path"] = "/poster.jpg";
    data["backdrop_path"] = "/backdrop.jpg";
    data["genres"] = QJsonArray{QJsonObject{{"name", "Science Fiction"}}};
    return data;
}

class MetadataTests : public QObject {
    Q_OBJECT
private slots:
    void parsingAndConservativeMatching() {
        auto query = TmdbClient::parseName("Alien (1979) 1080p BluRay");
        QCOMPARE(query.title, "Alien"); QCOMPARE(query.year, "1979");
        QCOMPARE(TmdbClient::parseName("The_Matrix.1080p.WEB-DL").title, "The Matrix");
        QCOMPARE(TmdbClient::parseName("1917.1080p").title, "1917");
        QJsonArray choices{candidate(1, "Alien", "1979-05-25"), candidate(2, "Alien", "2000-01-01")};
        QCOMPARE(TmdbClient::chooseMatch(choices, {"Alien", "1979"}), 1);
        QCOMPARE(TmdbClient::chooseMatch(choices, {"Alien", ""}), 0);
        QCOMPARE(TmdbClient::chooseMatch(choices, {"Aliens", "1979"}), 0);
        QCOMPARE(TmdbClient::imageUrl("https://evil.example/image.jpg", "w500"), QString());
        QCOMPARE(TmdbClient::imageUrl("/../secret.jpg", "w500"), QString());
    }
    void retryWrongYearAndFolder() {
        FakeTmdb api;
        api.replies = {QJsonObject{{"results", QJsonArray()}}, found(), details()};
        QSignalSpy resolved(&api, &TmdbClient::resolved);
        api.enqueue("a", "stamp", "Alien.2020", "");
        QTRY_COMPARE(resolved.size(), 1);
        QCOMPARE(resolved[0][3].toString(), "matched");
        QVERIFY(api.calls[0].contains("year=2020"));
        QVERIFY(!api.calls[1].contains("year="));
        QTRY_VERIFY(!api.busy());
        api.replies = {QJsonObject{{"results", QJsonArray()}}, found(), details()};
        api.enqueue("b", "stamp", "garbled-file", "Alien (1979)");
        QTRY_COMPARE(resolved.size(), 2);
        QCOMPARE(resolved[1][3].toString(), "matched");
    }
    void ambiguityAndNetworkFailureRemainUnmatched() {
        FakeTmdb api;
        api.replies = {QJsonObject{{"results", QJsonArray{candidate(1,"Alien","1979"),candidate(2,"Alien","2000")}}}};
        QSignalSpy resolved(&api, &TmdbClient::resolved);
        api.enqueue("a", "1", "Alien", "");
        QTRY_COMPARE(resolved.size(), 1);
        QCOMPARE(resolved[0][3].toString(), "unmatched");
        api.enqueue("b", "1", "Lost", "");
        api.enqueue("c", "1", "Other", "");
        QTRY_COMPARE(resolved.size(), 3);
        QCOMPARE(resolved[1][3].toString(), "error");
        QCOMPARE(resolved[2][3].toString(), "error");
        QCOMPARE(api.calls.size(), 2); // Stop the batch instead of hammering a failed API.
    }
    void persistenceFallbackAndNoImageFiles() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto root = dir.path() + "/movies";
        const auto cache = dir.path() + "/cache";
        QDir().mkpath(root);
        QProcess ffmpeg;
        ffmpeg.start("ffmpeg", {"-v","error","-f","lavfi","-i","color=c=blue:s=160x90:r=1","-t","2","-c:v","mpeg4",root+"/Alien.1979.mp4"});
        QVERIFY(ffmpeg.waitForFinished(15000)); QCOMPARE(ffmpeg.exitCode(), 0);
        QString id;
        {
            FakeTmdb api;
            api.replies = {found(), details()};
            Library lib(root, cache, true, &api);
            auto before = lib.scan()["movies"].toArray()[0].toObject();
            id = before["id"].toString();
            QCOMPARE(before["title"].toString(), "Alien");
            QCOMPARE(before["image"].toString(), QString());
            QSignalSpy updated(&lib, &Library::changed);
            QTRY_COMPARE(updated.size(), 1);
            auto matched = lib.snapshot()["movies"].toArray()[0].toObject();
            QCOMPARE(matched["tmdbId"].toInt(), 348);
            QCOMPARE(matched["image"].toString(), "https://image.tmdb.org/t/p/w1280/backdrop.jpg");
            QSignalSpy thumbnail(&lib, &Library::thumbnailReady);
            lib.requestThumbnail(id);
            QTRY_COMPARE_WITH_TIMEOUT(thumbnail.size(), 1, 25000);
            QVERIFY(thumbnail[0][1].toString().startsWith("data:image/jpeg;base64,"));
            lib.saveProgress(id, 50, 120);
            QFile json(cache + "/library.json"); QVERIFY(json.open(QIODevice::ReadOnly));
            const auto text = json.readAll();
            QVERIFY(!text.contains("data:image")); QVERIFY(!text.contains("test-token"));
            QVERIFY(!QFileInfo::exists(cache + "/artwork"));
            QCOMPARE(QDir(cache).entryList(QDir::Files).size(), 2);
        }
        {
            FakeTmdb api;
            Library lib(root, cache, true, &api);
            auto restored = lib.scan()["movies"].toArray()[0].toObject();
            QCOMPARE(restored["tmdbId"].toInt(), 348);
            QCOMPARE(restored["position"].toDouble(), 50.0);
            QCOMPARE(api.calls.size(), 0); QVERIFY(!api.busy());
            // A changed file invalidates enrichment; an API failure preserves local data.
            QFile file(root + "/Alien.1979.mp4"); QVERIFY(file.open(QIODevice::Append)); file.write("x"); file.close();
            auto changed = lib.scan()["movies"].toArray()[0].toObject();
            QVERIFY(!changed.contains("tmdbId"));
            QSignalSpy updated(&lib, &Library::changed);
            QTRY_COMPARE(updated.size(), 1);
            auto fallback = lib.snapshot()["movies"].toArray()[0].toObject();
            QCOMPARE(fallback["title"].toString(), "Alien");
            QCOMPARE(fallback["metadataStatus"].toString(), "error");
            QVERIFY(fallback["hasThumbnail"].toBool());
            QVERIFY(!lib.resolve(id).isEmpty());
            lib.scan(); QVERIFY(!api.busy()); // Error results have a retry interval.
        }
    }
};
QTEST_GUILESS_MAIN(MetadataTests)
#include "metadata.moc"
