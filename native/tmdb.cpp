#include "tmdb.h"
#include <QJsonDocument>
#include <QNetworkReply>
#include <QRegularExpression>
#include <QTimer>
#include <QDebug>

static QString normalized(QString title) {
    return title.normalized(QString::NormalizationForm_KD).toCaseFolded()
        .remove(QRegularExpression("[^\\p{L}\\p{N}]"));
}

TmdbClient::TmdbClient(QString token, QObject *parent)
    : QObject(parent), m_token(std::move(token)) {}

MovieQuery TmdbClient::parseName(QString name) {
    name.replace(QRegularExpression("[._]+"), " ");
    // Require a preceding title so movies named '1917' or '2001' survive.
    const auto year = QRegularExpression("^(.+?)[ \\[(\\-]+((?:19|20)\\d{2})(?=[ \\])\\-]|$)").match(name);
    MovieQuery query;
    if (year.hasMatch()) {
        query.title = year.captured(1).trimmed();
        query.year = year.captured(2);
    } else {
        query.title = name.section(QRegularExpression("\\b(?:480p|576p|720p|1080[pi]|2160p|4320p|bluray|blu-ray|brrip|bdrip|webrip|web-dl|hdtv|dvdrip|remux|x264|x265|h264|h265|hevc)\\b", QRegularExpression::CaseInsensitiveOption), 0, 0).trimmed();
    }
    query.title.remove(QRegularExpression("[ \\[\\]()\\-]+$"));
    return query;
}

int TmdbClient::chooseMatch(const QJsonArray &results, const MovieQuery &query) {
    QSet<int> candidates;
    for (const auto &entry : results) {
        const auto movie = entry.toObject();
        if (movie["adult"].toBool()) continue;
        if (normalized(movie["title"].toString()) != normalized(query.title)
            && normalized(movie["original_title"].toString()) != normalized(query.title)) continue;
        if (!query.year.isEmpty() && movie["release_date"].toString().left(4) != query.year) continue;
        if (movie["id"].toInt() > 0) candidates.insert(movie["id"].toInt());
    }
    // A full first page may hide more matching titles: leave it unmatched.
    return candidates.size() == 1 && results.size() < 20 ? *candidates.begin() : 0;
}

QString TmdbClient::imageUrl(const QString &path, const QString &size) {
    if (!QRegularExpression("^/[A-Za-z0-9_-]+\\.(jpg|png|webp)$").match(path).hasMatch()) return {};
    return "https://image.tmdb.org/t/p/" + size + path;
}

void TmdbClient::enqueue(QString id, QString stamp, QString filename, QString parentFolder) {
    const QString key = id + ":" + stamp;
    if (!enabled() || m_pending.contains(key)) return;
    Job job{id, stamp, {}};
    if (QStringList{"movies", "films", "videos", "media", "downloads", "1080p", "2160p", "4k"}.contains(parentFolder.toLower())) parentFolder.clear();
    for (const auto &name : {filename, parentFolder}) {
        auto query = parseName(name);
        if (query.title.isEmpty()) continue;
        job.queries.append(query);
        if (!query.year.isEmpty()) { query.year.clear(); job.queries.append(query); }
    }
    m_pending.insert(key);
    m_queue.enqueue(job);
    if (!m_active) QTimer::singleShot(0, this, &TmdbClient::next);
}

void TmdbClient::request(const QString &path, const QUrlQuery &query, Done done) {
    QUrl url("https://api.themoviedb.org/3" + path);
    url.setQuery(query);
    QNetworkRequest req(url);
    req.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    req.setRawHeader("Accept", "application/json");
    // Qt HTTP/2 stalls against TMDB in the current WSL environment; HTTP/1.1
    // succeeds with the same URL and token and is sufficient for small JSON calls.
    req.setAttribute(QNetworkRequest::Http2AllowedAttribute, false);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    req.setTransferTimeout(10000);
    auto *reply = m_network.get(req);
    // Bound both total time and response size. Never forward credentials on redirects.
    QTimer::singleShot(12000, reply, [reply] { reply->abort(); });
    connect(reply, &QNetworkReply::downloadProgress, reply, [reply](qint64 bytes, qint64) {
        if (bytes > 2 * 1024 * 1024) reply->abort();
    });
    connect(reply, &QNetworkReply::finished, this, [reply, done] {
        const auto doc = QJsonDocument::fromJson(reply->isOpen() ? reply->readAll() : QByteArray());
        const bool ok = reply->error() == QNetworkReply::NoError
            && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 && doc.isObject();
        if (!ok) qWarning() << "TMDB metadata unavailable; keeping local file details. HTTP"
            << reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() << reply->errorString();
        reply->deleteLater();
        done(doc.object(), ok);
    });
}

void TmdbClient::next() {
    if (m_active) return;
    if (m_queue.isEmpty()) { emit idle(); return; }
    m_job = m_queue.dequeue();
    m_active = true;
    search(0);
}

void TmdbClient::search(int index) {
    if (index >= m_job.queries.size()) { finish({}, "unmatched"); return; }
    const auto query = m_job.queries[index];
    QUrlQuery params{{"query", query.title}, {"language", "en-US"}, {"include_adult", "false"}};
    if (!query.year.isEmpty()) params.addQueryItem("year", query.year);
    request("/search/movie", params, [this, query, index](QJsonObject data, bool ok) {
        if (!ok || !data["results"].isArray()) { finish({}, "error"); return; }
        const int id = chooseMatch(data["results"].toArray(), query);
        if (!id || data["total_pages"].toInt() > 1) { search(index + 1); return; }
        request("/movie/" + QString::number(id), QUrlQuery{{"language", "en-US"}},
            [this, id](QJsonObject movie, bool ok) {
                if (!ok || movie["id"].toInt() != id || movie["title"].toString().isEmpty()) { finish({}, "error"); return; }
                QStringList genres;
                for (const auto &genre : movie["genres"].toArray()) genres << genre.toObject()["name"].toString();
                finish({{"tmdbId", id}, {"title", movie["title"]}, {"year", movie["release_date"].toString().left(4)},
                    {"synopsis", movie["overview"]}, {"genre", genres.join(" · ")},
                    {"posterUrl", imageUrl(movie["poster_path"].toString(), "w500")},
                    {"backdropUrl", imageUrl(movie["backdrop_path"].toString(), "w1280")}}, "matched");
            });
    });
}

void TmdbClient::finish(const QJsonObject &metadata, const QString &status) {
    m_pending.remove(m_job.id + ":" + m_job.stamp);
    emit resolved(m_job.id, m_job.stamp, metadata, status);
    m_active = false;
    if (status == "error") {
        // Offline, rejected credentials or rate limit: keep every file playable,
        // stop this batch, and let the library's retry timestamp govern refresh.
        while (!m_queue.isEmpty()) {
            auto job = m_queue.dequeue();
            m_pending.remove(job.id + ":" + job.stamp);
            emit resolved(job.id, job.stamp, {}, "error");
        }
    }
    QTimer::singleShot(250, this, &TmdbClient::next);
}
