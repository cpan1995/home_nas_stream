#include "onlinefilter.h"
#include <QtTest>
#include <QJsonArray>
#include <QJsonObject>
#include <QProcess>

namespace {
QJsonObject customRules() {
    return {
        {"scriptHosts", QJsonArray{"custom-player.example"}},
        {"blockedDomains", QJsonArray{}},
        {"providerOrigins", QJsonObject{{"custom", "https://custom-player.example"}}},
        {"frameRules", QJsonArray{QJsonObject{
            {"host", "custom-player.example"},
            {"pathPattern", "^/watch/[1-9][0-9]*$"},
            {"query", QJsonObject{{"language", "^(sub|dub)$"}}}
        }}}
    };
}
}

class OnlineFilterTests : public QObject {
    Q_OBJECT
private slots:
    void filtersExecutableResources() {
        OnlineFilterPolicy policy;
        const QUrl local("http://127.0.0.1:5174/movies");
        using I = QWebEngineUrlRequestInfo;
        for (const auto type : {I::ResourceTypeScript, I::ResourceTypeWorker, I::ResourceTypeServiceWorker}) {
            QVERIFY(policy.blocks(QUrl("https://new-ad-host.example/ad.js"), type, local));
            QVERIFY(policy.blocks(QUrl("https://moviesapi.to.evil.example/assets/player.js"), type, local));
            QVERIFY(policy.blocks(QUrl("https://moviesapi.to:444/assets/player.js"), type, local));
            QVERIFY(!policy.blocks(QUrl("https://moviesapi.to/assets/player.js"), type, local));
            QVERIFY(!policy.blocks(QUrl("http://127.0.0.1:5174/assets/app.js"), type, local));
        }
        QVERIFY(!policy.blocks(QUrl("blob:https://moviesapi.to/worker-id"), I::ResourceTypeWorker, local));
        QVERIFY(policy.blocks(QUrl("blob:https://unknown.example/worker-id"), I::ResourceTypeWorker, local));
        QVERIFY(!policy.blocks(QUrl("https://challenges.cloudflare.com/challenge.js"), I::ResourceTypeScript, local));
        QVERIFY(!policy.blocks(QUrl("https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js"), I::ResourceTypeScript, local));
        QVERIFY(!policy.blocks(QUrl("https://cdn.jsdelivr.net/npm/hls.js@1.5/dist/hls.min.js"), I::ResourceTypeScript, local));
        QVERIFY(!policy.blocks(QUrl("https://vjs.zencdn.net/8.10.0/video.min.js"), I::ResourceTypeScript, local));
        QVERIFY(policy.blocks(QUrl("https://vjs.zencdn.net/ad.js"), I::ResourceTypeScript, local));
        QVERIFY(policy.blocks(QUrl("https://cdn.jsdelivr.net/npm/disable-devtool@latest"), I::ResourceTypeScript, local));
        QVERIFY(!policy.blocks(QUrl("https://cdn.jsdelivr.net/npm/@videojs/http-streaming@3.10.0/dist/videojs-http-streaming.min.js"), I::ResourceTypeScript, local));
        QVERIFY(policy.blocks(QUrl("https://cdn.jsdelivr.net/npm/arbitrary-ad/script.js"), I::ResourceTypeScript, local));
    }
    void keepsPlayerFramesAndRejectsPromotions() {
        OnlineFilterPolicy policy;
        const QUrl local("http://127.0.0.1:5174/movies");
        using I = QWebEngineUrlRequestInfo;
        for (const QString &url : {"https://moviesapi.to/movie/533533?theme=064be4", "https://moviesapi.to/tv/66732/1/2",
                                  "https://vidlink.pro/movie/533533", "https://vidfast.vc/tv/66732/1/2",
                                  "https://player.cinezo.live/embed/movie/129", "https://player.cinezo.live/embed/tv/1429/3/13",
                                  "https://player.cinezo.live/embed/anime/104578/1?dub=true",
                                  "https://anixo.buzz/embed/ani/104578/1/sub", "https://supaplay.fun/stream/ani/104578/1/dub",
                                  "https://www.rivestream.app/embed?type=movie&id=100",
                                  "https://www.rivestream.app/embed?type=tv&id=1891&season=1&episode=1",
                                  "https://megaplay.buzz/stream/ani/154587/1/sub",
                                  "https://ani.megaplay.su/ani/154587/1/dub",
                                  "https://dropfile.cc/player/tv/anilist-154587/1/1?audio=sub&lang=en",
                                  "https://anilink.cc/watch/184356/9?variant=sub&autoplay=1",
                                  "https://tryembed.us.cc/embed/anime/184356/9/sub",
                                  "https://cinextream.cc/api/embed/anime/dub/184356/9",
                                  "https://nontongo.win/anime/184356/9/play",
                                  "https://cdn.4animo.xyz/embed/ani/184356/9/sub",
                                  "https://www.youtube-nocookie.com/embed/trailer"})
            QVERIFY(!policy.blocks(QUrl(url), I::ResourceTypeSubFrame, local));
        for (const QString &url : {"https://extension-promotion.example/install", "https://vidlink.pro/install", "https://vidfast.vc/ads",
                                  "https://vidlink.pro.evil.example/movie/533533", "https://vidfast.vc:444/movie/533533", "https://moviesapi.to/install",
                                  "https://moviesapi.to.evil.example/movie/533533", "https://moviesapi.to@evil.example/movie/533533",
                                  "https://player.cinezo.live/install", "https://anixo.buzz/embed/ani/104578/0/sub",
                                  "https://anixo.buzz.evil.example/embed/ani/104578/1/sub", "https://supaplay.fun/stream/ani/104578/1/ads",
                                  "https://www.rivestream.app/watch?type=movie&id=100", "https://www.rivestream.app/embed?type=tv&id=1891",
                                  "https://www.rivestream.app/embed?type=tv&id=1891&season=1&episode=0",
                                  "https://www.rivestream.app/embed?type=movie&id=100&id=200",
                                  "https://www.rivestream.app/embed?type=other&id=100",
                                  "https://www.rivestream.app.evil.example/embed?type=movie&id=100",
                                  "https://megaplay.buzz/install", "https://ani.megaplay.su/ani/154587/0/sub",
                                  "https://ani.megaplay.su.evil.example/ani/154587/1/sub",
                                  "https://dropfile.cc/player/tv/anilist-154587/1/0",
                                  "https://anilink.cc/watch/184356/9?variant=sub&variant=dub",
                                  "https://anilink.cc/watch/184356/9?variant=ads",
                                  "https://tryembed.us.cc/embed/anime/184356/0/sub",
                                  "https://tryembed.us.cc.evil.example/embed/anime/184356/9/sub",
                                  "https://cinextream.cc/api/embed/anime/sub/184356/9/install",
                                  "https://nontongo.win/install", "https://cdn.4animo.xyz/embed/ani/184356/9/ads",
                                  "https://dropfile.cc/install", "file:///tmp/page.html", "data:text/html,<script>alert(1)</script>"})
            QVERIFY(policy.blocks(QUrl(url), I::ResourceTypeSubFrame, local));
        QVERIFY(policy.blocks(QUrl("https://moviesapi.to/movie/533533"), I::ResourceTypeMainFrame, local));
        QVERIFY(!policy.blocks(QUrl("http://127.0.0.1:5174/watch/movie/533533"), I::ResourceTypeMainFrame, local));
    }
    void preservesChangingMediaHosts() {
        OnlineFilterPolicy policy;
        const QUrl local("http://127.0.0.1:5174/movies");
        using I = QWebEngineUrlRequestInfo;
        QVERIFY(!policy.blocks(QUrl("https://new-cdn.example/stream.m3u8"), I::ResourceTypeXhr, local));
        QVERIFY(!policy.blocks(QUrl("https://new-cdn.example/segment.ts"), I::ResourceTypeMedia, local));
        QVERIFY(!policy.blocks(QUrl("https://rest.opensubtitles.org/search/movie"), I::ResourceTypeXhr, local));
        QVERIFY(!policy.blocks(QUrl("https://image.tmdb.org/t/p/original/poster.jpg"), I::ResourceTypeImage, local));
        QVERIFY(policy.blocks(QUrl("https://sub.el8lqnlh5i9xmh9q.rest/ad"), I::ResourceTypeXhr, local));
        QVERIFY(policy.blocks(QUrl("https://EL8LQNLH5I9XMH9Q.REST./ad"), I::ResourceTypeImage, local));
        QVERIFY(!policy.blocks(QUrl("https://notel8lqnlh5i9xmh9q.rest/image"), I::ResourceTypeImage, local));
        QVERIFY(policy.blocks(QUrl("http://127.0.0.1:8080/private"), I::ResourceTypeXhr, local));
        QVERIFY(policy.blocks(QUrl("qrc:/ui/index.html"), I::ResourceTypeXhr, local));
    }
    void usesConfiguredProviderFrameRules() {
        OnlineFilterPolicy policy(customRules());
        const QUrl local("http://127.0.0.1:5174/movies");
        using I = QWebEngineUrlRequestInfo;
        QVERIFY(!policy.blocks(QUrl("https://custom-player.example/watch/42?language=sub&theme=dark"), I::ResourceTypeSubFrame, local));
        QVERIFY(policy.blocks(QUrl("https://custom-player.example/watch/42"), I::ResourceTypeSubFrame, local));
        QVERIFY(policy.blocks(QUrl("https://custom-player.example/watch/42?language=sub&language=dub"), I::ResourceTypeSubFrame, local));
        QVERIFY(policy.blocks(QUrl("https://custom-player.example/watch/0?language=sub"), I::ResourceTypeSubFrame, local));
        QVERIFY(policy.blocks(QUrl("https://custom-player.example/install?language=sub"), I::ResourceTypeSubFrame, local));
    }
    void rejectsMalformedRuleSchema() {
        for (const QString &caseName : {"bad-script-host", "unconfigured-frame-host", "empty-path-pattern", "unanchored-query-pattern", "nonobject-query"})
            QVERIFY2(QProcess::execute(QCoreApplication::applicationFilePath(), {"--invalid-rule", caseName}) != 0, qPrintable(caseName));
    }
};
int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    if (app.arguments().size() == 3 && app.arguments().at(1) == "--invalid-rule") {
        QJsonObject rules = customRules();
        const QString caseName = app.arguments().at(2);
        auto frame = rules.value("frameRules").toArray();
        auto rule = frame.first().toObject();
        if (caseName == "bad-script-host") rules.insert("scriptHosts", QJsonArray{"bad_host.example"});
        else if (caseName == "unconfigured-frame-host") rule.insert("host", "unconfigured.example");
        else if (caseName == "empty-path-pattern") rule.insert("pathPattern", "");
        else if (caseName == "unanchored-query-pattern") rule.insert("query", QJsonObject{{"language", "sub|dub"}});
        else if (caseName == "nonobject-query") rule.insert("query", QJsonArray{});
        else return 2;
        frame[0] = rule;
        rules.insert("frameRules", frame);
        OnlineFilterPolicy policy(rules);
        return 0;
    }
    OnlineFilterTests tests;
    return QTest::qExec(&tests, argc, argv);
}
#include "online-filter.moc"
