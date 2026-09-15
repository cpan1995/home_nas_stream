#pragma once
#include <QObject>
#include <QHostAddress>
#include <QPointer>
#include <QTcpServer>
#include <QUdpSocket>
#include <QTimer>
#include <QElapsedTimer>
#include <QSet>
#include <QWebSocketServer>

class QQuickWindow;
class QTcpSocket;
class QWebSocket;

// A deliberately small Roku ECP-compatible receiver. No file, shell, or URL commands.
class NetworkRemote : public QObject {
    Q_OBJECT
public:
    explicit NetworkRemote(const QString &dataDir, QObject *parent = nullptr);
    ~NetworkRemote() override;
    bool start(quint16 httpPort = 8060, quint16 discoveryPort = 1900);
    QString errorString() const { return m_error; }
    quint16 port() const { return m_http.serverPort(); }
    quint16 discoveryPort() const { return m_ssdp.localPort(); }
    QStringList remoteUrls() const;
    void setWindow(QQuickWindow *window);
    void setOnline(bool online) { m_online = online; }
    Q_INVOKABLE void setVolumeState(int value) { m_volume = qBound(-1, value, 100); }
    Q_INVOKABLE void sendKey(QString name);
signals:
    void command(QString key);
private:
    void acceptConnections();
    void readRequest(QTcpSocket *socket);
    void acceptSessions();
    void sessionMessage(QWebSocket *socket, const QString &message);
    QByteArray queryContent(const QString &path) const;
    void reply(QTcpSocket *socket, int status, const QByteArray &body = {}, const QByteArray &type = "text/xml; charset=utf-8");
    void discover();
    void refreshInterfaces();
    void announce(bool alive);
    bool localPeer(const QHostAddress &address) const;
    QString addressFor(const QHostAddress &peer) const;
    QByteArray description(const QString &address) const;
    QByteArray deviceInfo() const;
    bool allowedKey(const QString &key) const;
    void dispatch(const QString &key, const QString &action);
    QString m_id, m_error, m_held;
    QTcpServer m_http;
    QWebSocketServer m_webSockets{"Screening Room", QWebSocketServer::NonSecureMode};
    QUdpSocket m_ssdp;
    QTimer m_announce, m_interfaces, m_repeat, m_release;
    QElapsedTimer m_budget;
    QSet<QTcpSocket *> m_clients;
    QSet<QWebSocket *> m_sessions;
    QSet<int> m_joined;
    QPointer<QQuickWindow> m_window;
    int m_volume = 100;
    int m_requests = 0, m_searches = 0;
    quint64 m_holdGeneration = 0;
    bool m_online = false;
    bool m_debug = false;
};
