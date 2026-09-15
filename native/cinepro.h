#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QProcess>
#include <QTimer>
#include <QUrl>

// Owns the local frontend service; it never opens an external browser.
class CinePro : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY changed)
    Q_PROPERTY(bool starting READ starting NOTIFY changed)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QUrl url READ url CONSTANT)
public:
    explicit CinePro(QObject *parent = nullptr);
    ~CinePro() override;
    bool active() const { return m_active; }
    bool starting() const { return m_starting; }
    bool ready() const { return m_ready; }
    QString error() const { return m_error; }
    QUrl url() const { return m_url; }
    Q_INVOKABLE void setActive(bool active);
    Q_INVOKABLE void start();
signals:
    void changed();
private:
    void fail(const QString &message);
    void launch();
    bool m_active = false, m_starting = false, m_ready = false;
    QString m_error;
    QUrl m_url{"http://127.0.0.1:5174/movies?screeningRoom=1"};
    QNetworkAccessManager m_network;
    QProcess m_process;
    QTimer m_timeout;
};
