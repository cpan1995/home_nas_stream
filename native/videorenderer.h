#pragma once
#include <QObject>
#include <QImage>
#include <QMutex>
#include <atomic>
#include <memory>
#include <mpv/render.h>

// All mpv render calls run on this object's dedicated thread. Only the latest
// image is retained if the UI is busy, keeping memory use bounded.
class VideoRenderer : public QObject {
    Q_OBJECT
public:
    explicit VideoRenderer(std::shared_ptr<mpv_handle> core);
    bool initialize();
    void shutdown();
    void resize(QSize size);
    QImage takeFrame();
signals:
    void frameReady();
private:
    void schedule();
    void render(bool force = false);
    std::shared_ptr<mpv_handle> m_core;
    mpv_render_context *m_render = nullptr;
    QSize m_size{1440, 900};
    QMutex m_mutex;
    QImage m_frame;
    bool m_notificationPending = false;
    std::atomic_bool m_workPending{false};
};
