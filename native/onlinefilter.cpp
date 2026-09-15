#include "onlinefilter.h"
#include <QFile>
#include <QSet>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QHash>
#include <QRegularExpression>
#include <QUrlQuery>

namespace {
QString host(const QUrl &url) {
    QString value = url.host().toLower();
    while (value.endsWith('.')) value.chop(1);
    return value;
}
bool sameOrigin(const QUrl &a, const QUrl &b) {
    return a.scheme() == b.scheme() && host(a) == host(b) &&
        a.port(a.scheme() == "https" ? 443 : 80) == b.port(b.scheme() == "https" ? 443 : 80);
}
bool validHost(const QString &value) {
    if (value.isEmpty() || value.size() > 253 || value != value.toLower()) return false;
    static const QRegularExpression hostname("^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$");
    return hostname.match(value).hasMatch();
}
bool validAnchoredPattern(const QJsonValue &value) {
    if (!value.isString() || value.toString().isEmpty()) return false;
    const QString pattern = value.toString();
    return pattern.startsWith('^') && pattern.endsWith('$') && QRegularExpression(pattern).isValid();
}
}

OnlineFilterPolicy::OnlineFilterPolicy() {
    QFile file(":/config/online-filter.json");
    if (!file.open(QIODevice::ReadOnly)) qFatal("Online filter rules are missing");
    load(QJsonDocument::fromJson(file.readAll()).object());
}

OnlineFilterPolicy::OnlineFilterPolicy(const QJsonObject &rules) {
    load(rules);
}

void OnlineFilterPolicy::load(const QJsonObject &rules) {
    if (!rules.value("scriptHosts").isArray() || !rules.value("blockedDomains").isArray() ||
        !rules.value("providerOrigins").isObject() || !rules.value("frameRules").isArray())
        qFatal("Online filter rules are invalid");
    for (const auto &value : rules.value("scriptHosts").toArray()) {
        if (!value.isString() || !validHost(value.toString())) qFatal("Online filter script hosts are invalid");
        m_scriptHosts << value.toString();
    }
    for (const auto &value : rules.value("blockedDomains").toArray()) m_blockedDomains << value.toString();
    const auto origins = rules.value("providerOrigins").toObject();
    QSet<QString> providerHosts;
    for (auto it = origins.begin(); it != origins.end(); ++it) {
        if (!it.value().isString()) qFatal("Online filter provider origins are invalid");
        const QUrl origin(it.value().toString());
        if (it.key().isEmpty() || !origin.isValid() || origin.scheme() != "https" || host(origin).isEmpty() ||
            !validHost(host(origin)) || !origin.userInfo().isEmpty() || origin.port(443) != 443 || (!origin.path().isEmpty() && origin.path() != "/") || origin.hasQuery() || origin.hasFragment())
            qFatal("Online filter provider origins are invalid");
        const QString name = host(origin);
        providerHosts.insert(name);
        m_providerOrigins.insert(it.key(), QStringLiteral("https://") + name);
    }
    for (const auto &value : rules.value("frameRules").toArray()) {
        if (!value.isObject()) qFatal("Online filter frame rules are invalid");
        const auto object = value.toObject();
        FrameRule rule;
        rule.host = object.value("host").toString().toLower();
        if (!validHost(rule.host) || !providerHosts.contains(rule.host) || !validAnchoredPattern(object.value("pathPattern")))
            qFatal("Online filter frame rules are invalid");
        rule.pathPattern = QRegularExpression(object.value("pathPattern").toString());
        if (!object.value("query").isObject()) qFatal("Online filter frame rules are invalid");
        const auto query = object.value("query").toObject();
        for (auto it = query.begin(); it != query.end(); ++it) {
            if (it.key().isEmpty() || !validAnchoredPattern(it.value())) qFatal("Online filter frame rules are invalid");
            const QRegularExpression expression(it.value().toString());
            rule.query.insert(it.key(), expression);
        }
        m_frameRules << rule;
    }
    if (m_scriptHosts.isEmpty() || m_providerOrigins.isEmpty() || m_frameRules.isEmpty())
        qFatal("Online filter rules are invalid");
}

bool OnlineFilterPolicy::acceptsFrame(const QUrl &url) const {
    const QString name = host(url);
    const QUrlQuery values(url);
    for (const auto &rule : m_frameRules) {
        if (name != rule.host || !rule.pathPattern.match(url.path()).hasMatch()) continue;
        bool matches = true;
        for (auto it = rule.query.cbegin(); it != rule.query.cend(); ++it) {
            const auto supplied = values.allQueryItemValues(it.key());
            if (supplied.size() != 1 || !it.value().match(supplied.constFirst()).hasMatch()) {
                matches = false;
                break;
            }
        }
        if (matches) return true;
    }
    return false;
}

bool OnlineFilterPolicy::blocks(const QUrl &url, QWebEngineUrlRequestInfo::ResourceType type, const QUrl &localUrl) const {
    using Info = QWebEngineUrlRequestInfo;
    const auto name = host(url);
    if (!url.isValid() || !url.userInfo().isEmpty()) return true;
    for (const auto &domain : m_blockedDomains)
        if (name == domain || name.endsWith('.' + domain)) return true;
    const bool main = type == Info::ResourceTypeMainFrame;
    const bool frame = type == Info::ResourceTypeSubFrame || type == Info::ResourceTypeNavigationPreloadSubFrame;
    const bool script = type == Info::ResourceTypeScript || type == Info::ResourceTypeWorker ||
        type == Info::ResourceTypeSharedWorker || type == Info::ResourceTypeServiceWorker;
    if (main || type == Info::ResourceTypeNavigationPreloadMainFrame) return !sameOrigin(url, localUrl);
    if (url == QUrl("about:blank")) return false;
    // HLS uses blob workers; permit blobs created by the application/player.
    if (url.scheme() == "blob") {
        const QUrl creator(url.toString().mid(5));
        return frame || !(sameOrigin(creator, localUrl) || (creator.scheme() == "https" && m_scriptHosts.contains(host(creator))));
    }
    if (url.scheme() == "data") return frame || script;
    if (sameOrigin(url, localUrl)) return false;
    if (url.scheme() != "https") return true;
    if ((frame || script) && url.port(443) != 443) return true;
    if (frame) {
        if (acceptsFrame(url)) return false;
        if (name == "www.youtube-nocookie.com") return !url.path().startsWith("/embed/");
        return name != "challenges.cloudflare.com";
    }
    // Restrict executable resources, while leaving changing media/subtitle CDNs usable.
    if (script) {
        // Observed player dependencies; do not permit arbitrary CDN scripts.
        if (name == "esm.sh") {
            static const QSet<QString> modules{
                "/react@18.2.0", "/react@18.2.0/es2022/react.mjs",
                "/react-dom@18.2.0/client", "/react-dom@18.2.0/es2022/client.mjs", "/react-dom@18.2.0/es2022/react-dom.mjs",
                "/lucide-react@0.292.0", "/lucide-react@0.292.0/X-ZHJlYWN0QDE4LjIuMA/es2022/lucide-react.mjs",
                "/scheduler@^0.23.0", "/scheduler@0.23.2/es2022/scheduler.mjs"
            };
            return !modules.contains(url.path());
        }
        if (name == "vjs.zencdn.net" && url.path() == "/8.10.0/video.min.js") return false;
        if (name == "cdn.tailwindcss.com" && (url.path() == "/" || url.path() == "/3.4.17")) return false;
        if (name == "ajax.googleapis.com" && url.path() == "/ajax/libs/jquery/3.2.1/jquery.min.js") return false;
        if (name == "ssl.p.jwpcdn.com" && (url.path() == "/player/v/8.36.7/jwplayer.core.controls.js" || url.path() == "/player/v/8.36.7/provider.hlsjs.js")) return false;
        if (name == "cdn.jsdelivr.net" && (url.path() == "/npm/dashjs@4.7.4/dist/dash.all.min.js" ||
                                            url.path() == "/npm/hls.js@1.5/dist/hls.min.js" ||
                                            url.path() == "/npm/@videojs/http-streaming@3.10.0/dist/videojs-http-streaming.min.js")) return false;
        return !m_scriptHosts.contains(name);
    }
    return false;
}

void OnlineRequestFilter::setLocalUrl(const QUrl &url) {
    QWriteLocker lock(&m_lock);
    m_localUrl = url;
}
void OnlineRequestFilter::interceptRequest(QWebEngineUrlRequestInfo &info) {
    QReadLocker lock(&m_lock);
    if (m_policy.blocks(info.requestUrl(), info.resourceType(), m_localUrl)) {
        info.block(true);
        emit requestBlocked();
    }
}
bool OnlineRequestFilter::blocksNavigation(const QUrl &url, bool mainFrame) {
    QReadLocker lock(&m_lock);
    return m_policy.blocks(url, mainFrame ? QWebEngineUrlRequestInfo::ResourceTypeMainFrame : QWebEngineUrlRequestInfo::ResourceTypeSubFrame, m_localUrl);
}
FilteredWebProfile::FilteredWebProfile(QObject *parent) : QQuickWebEngineProfile(parent) {
    setOffTheRecord(true);
    setHttpCacheType(MemoryHttpCache);
    setPersistentCookiesPolicy(NoPersistentCookies);
    connect(&m_filter, &OnlineRequestFilter::requestBlocked, this, [this] {
        ++m_blockedCount;
        emit blockedCountChanged();
    }, Qt::QueuedConnection);
    setUrlRequestInterceptor(&m_filter);
}
FilteredWebProfile::~FilteredWebProfile() { setUrlRequestInterceptor(nullptr); }
bool FilteredWebProfile::acceptsNavigation(const QUrl &url, bool mainFrame) {
    if (!m_filter.blocksNavigation(url, mainFrame)) return true;
    ++m_blockedCount;
    emit blockedCountChanged();
    return false;
}
void FilteredWebProfile::setLocalUrl(const QUrl &url) {
    if (m_localUrl == url) return;
    m_localUrl = url;
    m_filter.setLocalUrl(url);
    emit localUrlChanged();
}
