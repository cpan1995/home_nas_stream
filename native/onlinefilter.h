#pragma once
#include <QQuickWebEngineProfile>
#include <QWebEngineUrlRequestInterceptor>
#include <QWebEngineUrlRequestInfo>
#include <QReadWriteLock>
#include <QRegularExpression>
#include <QStringList>
#include <QVariantMap>
#include <QHash>

class QJsonObject;

class OnlineFilterPolicy {
public:
    OnlineFilterPolicy();
    explicit OnlineFilterPolicy(const QJsonObject &rules);
    bool blocks(const QUrl &url, QWebEngineUrlRequestInfo::ResourceType type, const QUrl &localUrl) const;
    QVariantMap providerOrigins() const { return m_providerOrigins; }
private:
    struct FrameRule {
        QString host;
        QRegularExpression pathPattern;
        QHash<QString, QRegularExpression> query;
    };
    bool acceptsFrame(const QUrl &url) const;
    void load(const QJsonObject &rules);
    QStringList m_scriptHosts, m_blockedDomains;
    QList<FrameRule> m_frameRules;
    QVariantMap m_providerOrigins;
};

class OnlineRequestFilter : public QWebEngineUrlRequestInterceptor {
    Q_OBJECT
public:
    explicit OnlineRequestFilter(QObject *parent = nullptr) : QWebEngineUrlRequestInterceptor(parent) {}
    void setLocalUrl(const QUrl &url);
    QVariantMap providerOrigins() const { return m_policy.providerOrigins(); }
    bool blocksNavigation(const QUrl &url, bool mainFrame);
    void interceptRequest(QWebEngineUrlRequestInfo &info) override;
signals:
    void requestBlocked();
private:
    OnlineFilterPolicy m_policy;
    QReadWriteLock m_lock;
    QUrl m_localUrl;
};

class FilteredWebProfile : public QQuickWebEngineProfile {
    Q_OBJECT
    Q_PROPERTY(QUrl localUrl READ localUrl WRITE setLocalUrl NOTIFY localUrlChanged)
    Q_PROPERTY(int blockedCount READ blockedCount NOTIFY blockedCountChanged)
    Q_PROPERTY(QVariantMap providerOrigins READ providerOrigins CONSTANT)
public:
    explicit FilteredWebProfile(QObject *parent = nullptr);
    ~FilteredWebProfile() override;
    QUrl localUrl() const { return m_localUrl; }
    void setLocalUrl(const QUrl &url);
    int blockedCount() const { return m_blockedCount; }
    QVariantMap providerOrigins() const { return m_filter.providerOrigins(); }
    Q_INVOKABLE bool acceptsNavigation(const QUrl &url, bool mainFrame);
signals:
    void localUrlChanged();
    void blockedCountChanged();
private:
    OnlineRequestFilter m_filter;
    QUrl m_localUrl;
    int m_blockedCount = 0;
};
