#include "videorenderer.h"
#include <QMutexLocker>

VideoRenderer::VideoRenderer(std::shared_ptr<mpv_handle> core) : m_core(std::move(core)) {}
bool VideoRenderer::initialize() {
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, const_cast<char *>(MPV_RENDER_API_TYPE_SW)},
        {MPV_RENDER_PARAM_INVALID, nullptr}
    };
    if (mpv_render_context_create(&m_render, m_core.get(), params) < 0) return false;
    mpv_render_context_set_update_callback(m_render, [](void *context) {
        static_cast<VideoRenderer *>(context)->schedule();
    }, this);
    return true;
}
void VideoRenderer::shutdown() {
    if (!m_render) return;
    mpv_render_context_set_update_callback(m_render, nullptr, nullptr);
    mpv_render_context_free(m_render);
    m_render = nullptr;
}
void VideoRenderer::schedule() {
    if (!m_workPending.exchange(true)) QMetaObject::invokeMethod(this, [this] {
        m_workPending = false;
        render(true);
    }, Qt::QueuedConnection);
}
void VideoRenderer::resize(QSize size) {
    if (size.isEmpty() || size == m_size) return;
    m_size = size;
    render(true);
}
void VideoRenderer::render(bool force) {
    if (!m_render) return;
    const auto flags = mpv_render_context_update(m_render);
    if (!(flags & MPV_RENDER_UPDATE_FRAME) && !force) return;
    QImage image(m_size, QImage::Format_RGB32);
    int dimensions[] = {m_size.width(), m_size.height()};
    size_t stride = image.bytesPerLine();
    // Render ahead using mpv's normal timing, then wait for presentation on
    // this worker. Requesting frames only when due makes SW conversion late.
    int block = 1;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_SW_SIZE, dimensions},
        {MPV_RENDER_PARAM_SW_FORMAT, const_cast<char *>("bgr0")},
        {MPV_RENDER_PARAM_SW_STRIDE, &stride},
        {MPV_RENDER_PARAM_SW_POINTER, image.bits()},
        {MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, &block},
        {MPV_RENDER_PARAM_INVALID, nullptr}
    };
    mpv_render_context_render(m_render, params);
    // bgr0 leaves its unused byte undefined; Qt's RGB32 requires opaque alpha.
    for (int y = 0; y < image.height(); ++y) {
        auto *row = reinterpret_cast<QRgb *>(image.scanLine(y));
        for (int x = 0; x < image.width(); ++x) row[x] |= 0xff000000;
    }
    bool notify = false;
    {
        QMutexLocker lock(&m_mutex);
        m_frame = std::move(image);
        notify = !m_notificationPending;
        m_notificationPending = true;
    }
    if (notify) emit frameReady();
}
QImage VideoRenderer::takeFrame() {
    QMutexLocker lock(&m_mutex);
    m_notificationPending = false;
    return m_frame;
}
