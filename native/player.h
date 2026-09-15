#pragma once
#include "library.h"
#include <QQuickPaintedItem>
#include <QImage>
#include <mpv/render.h>
#include <QTimer>
#include <mpv/client.h>
#include <memory>
#include <functional>
#include <QVariantMap>
#include <QThread>

class VideoRenderer;

class Player : public QQuickPaintedItem {
    Q_OBJECT
public:
    explicit Player(QQuickItem *parent = nullptr);
    ~Player() override;
    void paint(QPainter *painter) override;
    void setLibrary(Library *library);
    std::function<QStringList()> remoteAddresses;
    mpv_handle *handle() const { return m_mpv; }
public slots:
    QStringList remoteUrls() { return remoteAddresses ? remoteAddresses() : QStringList{}; }
    QString library();
    QString refreshLibrary();
    void requestThumbnail(QString id);
    QString playbackState();
    void play(QString id, bool restart = false);
    void pause();
    void seek(double seconds);
    void seekRelative(double seconds);
    void volume(double value);
    void track(QString type, int id);
    void stop();
    void fullscreen();
    void openCinePro() { emit cineProRequested(); }
    void capture(QString path);
    void testKey(QString key);
    bool testClick(QString objectName);
    QString testState();
    void testFocus(QString objectName);
signals:
    void cineProRequested();
    void playbackChanged(QString state);
    void libraryChanged(QString library);
    void thumbnailReady(QString id, QString image);
    void playbackError(QString message);
    void eventsReady();
protected:
    void geometryChange(const QRectF &geometry, const QRectF &previous) override;
private:
    void poll();
    void persist();
    void command(const QStringList &args);
    void setProperty(const char *name, const QString &value);
    double number(const char *name) const;
    bool flag(const char *name) const;
    QVariant mpvProperty(const char *name) const;
    mpv_handle *m_mpv = nullptr;
    std::shared_ptr<mpv_handle> m_core;
    QThread m_renderThread;
    VideoRenderer *m_renderer = nullptr;
    QImage m_frame;
    Library *m_library = nullptr;
    QTimer m_timer, m_saveTimer, m_seekTimer;
    QString m_current;
    bool m_loading = false;
    bool m_loadfileHasIndex = false;
    double m_position = 0, m_duration = 0;
    double m_seekTarget = -1;
    double m_lastSeekTarget = -1;
    int m_seekCount = 0;
    quint64 m_renderedFrames = 0;
};
