#include "player.h"
#include "videorenderer.h"
#include <QGuiApplication>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QUrl>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#ifdef SCREENING_ROOM_TESTING
#include <QTest>
#endif
#include <QQuickWindow>
#include <algorithm>
#include <cmath>
#include <stdexcept>

static QString json(const QJsonObject &value) { return QString::fromUtf8(QJsonDocument(value).toJson(QJsonDocument::Compact)); }
static QVariant nodeValue(const mpv_node &node);

Player::Player(QQuickItem *parent) : QQuickPaintedItem(parent) {
    m_mpv = mpv_create();
    if (!m_mpv) throw std::runtime_error("Could not create mpv player");
    mpv_set_option_string(m_mpv, "vo", "libmpv");
    mpv_set_option_string(m_mpv, "hwdec", qEnvironmentVariable("SCREENING_ROOM_HWDEC", "auto").toUtf8().constData());
    auto audioOutput = qEnvironmentVariable("SCREENING_ROOM_AO");
    const auto pulseServer = qEnvironmentVariable("PULSE_SERVER");
    // WSLg exposes PulseAudio directly. Auto selection can hang in PipeWire
    // teardown before falling back, blocking mpv and the UI's state queries.
    if (audioOutput.isEmpty() && (pulseServer == "unix:/mnt/wslg/PulseServer" ||
                                  pulseServer == "/mnt/wslg/PulseServer"))
        audioOutput = "pulse";
    if (!audioOutput.isEmpty())
        mpv_set_option_string(m_mpv, "ao", audioOutput.toUtf8().constData());
    mpv_set_option_string(m_mpv, "idle", "yes");
    mpv_set_option_string(m_mpv, "keep-open", "yes");
    mpv_set_option_string(m_mpv, "osc", "no");
    mpv_set_option_string(m_mpv, "input-default-bindings", "no");
    mpv_set_option_string(m_mpv, "osd-level", "0");
    mpv_set_option_string(m_mpv, "config", "no");
    // The render worker submits immediately; do not ask mpv for early frames
    // that would otherwise need a blocking wait inside the render callback.
    if (mpv_initialize(m_mpv) < 0) throw std::runtime_error("Could not initialize mpv");
    m_core = std::shared_ptr<mpv_handle>(m_mpv, mpv_terminate_destroy);
    // loadfile gained an index argument in mpv 0.38. Inspect the command once,
    // before creating the renderer, so per-file start options work on both APIs.
    mpv_node commands{};
    if (mpv_get_property(m_mpv, "command-list", MPV_FORMAT_NODE, &commands) >= 0) {
        for (const auto &entry : nodeValue(commands).toList()) {
            const auto command = entry.toMap();
            if (command.value("name").toString() != "loadfile") continue;
            for (const auto &argument : command.value("args").toList())
                if (argument.toMap().value("name").toString() == "index") m_loadfileHasIndex = true;
        }
        mpv_free_node_contents(&commands);
    }
    mpv_request_log_messages(m_mpv, "warn");
    connect(this, &Player::eventsReady, this, &Player::poll, Qt::QueuedConnection);
    mpv_set_wakeup_callback(m_mpv, [](void *ctx) { emit static_cast<Player *>(ctx)->eventsReady(); }, this);
    m_renderer = new VideoRenderer(m_core);
    m_renderer->moveToThread(&m_renderThread);
    connect(&m_renderThread, &QThread::finished, m_renderer, &QObject::deleteLater);
    connect(m_renderer, &VideoRenderer::frameReady, this, [this] {
        m_frame = m_renderer->takeFrame();
        ++m_renderedFrames;
        update();
    }, Qt::QueuedConnection);
    m_renderThread.start();
    bool ready = false;
    QMetaObject::invokeMethod(m_renderer, [this, &ready] { ready = m_renderer->initialize(); }, Qt::BlockingQueuedConnection);
    if (!ready) {
        m_renderThread.quit(); m_renderThread.wait();
        throw std::runtime_error("Could not initialize the video surface");
    }
    setFillColor(Qt::black);
    setOpaquePainting(true);
    connect(&m_timer, &QTimer::timeout, this, [this] { poll(); emit playbackChanged(playbackState()); });
    connect(&m_saveTimer, &QTimer::timeout, this, &Player::persist);
    m_seekTimer.setSingleShot(true);
    m_seekTimer.setInterval(60);
    connect(&m_seekTimer, &QTimer::timeout, this, [this] {
        if (m_seekTarget < 0 || m_current.isEmpty()) return;
        ++m_seekCount;
        m_lastSeekTarget = m_seekTarget;
        command({"seek", QString::number(m_seekTarget, 'f', 3), "absolute+exact"});
        m_seekTarget = -1;
    });
    m_timer.start(250); m_saveTimer.start(5000);
}
Player::~Player() {
    m_timer.stop(); m_saveTimer.stop(); m_seekTimer.stop(); persist();
    mpv_set_wakeup_callback(m_mpv, nullptr, nullptr);
    QMetaObject::invokeMethod(m_renderer, [this] { m_renderer->shutdown(); }, Qt::BlockingQueuedConnection);
    m_renderThread.quit(); m_renderThread.wait();
}
void Player::geometryChange(const QRectF &geometry, const QRectF &previous) {
    QQuickPaintedItem::geometryChange(geometry, previous);
    if (m_renderer) QMetaObject::invokeMethod(m_renderer, [renderer = m_renderer, size = geometry.size().toSize()] {
        renderer->resize(size);
    }, Qt::QueuedConnection);
}
void Player::paint(QPainter *painter) {
    if (!m_frame.isNull()) painter->drawImage(boundingRect(), m_frame);
}
double Player::number(const char *name) const { double value = 0; mpv_get_property(m_mpv, name, MPV_FORMAT_DOUBLE, &value); return value; }
bool Player::flag(const char *name) const { int value = 0; mpv_get_property(m_mpv, name, MPV_FORMAT_FLAG, &value); return value != 0; }
QVariant Player::mpvProperty(const char *name) const {
    mpv_node node{};
    if (mpv_get_property(m_mpv, name, MPV_FORMAT_NODE, &node) < 0) return {};
    auto value = nodeValue(node);
    mpv_free_node_contents(&node);
    return value;
}
void Player::command(const QStringList &args) {
    QList<QByteArray> storage; for (const auto &arg : args) storage.append(arg.toUtf8());
    QList<const char *> argv; for (const auto &arg : storage) argv.append(arg.constData()); argv.append(nullptr);
    // The independent render thread keeps servicing mpv while a command
    // completes, preserving command ordering without blocking video rendering.
    int result = mpv_command(m_mpv, argv.data());
    if (result < 0) emit playbackError(QString::fromUtf8(mpv_error_string(result)));
}
void Player::setProperty(const char *name, const QString &value) {
    const int result = mpv_set_property_string(m_mpv, name, value.toUtf8().constData());
    if (result < 0) emit playbackError(QString::fromUtf8(mpv_error_string(result)));
}
QString Player::library() {
    if (!m_library) return json({{"movies", QJsonArray()}});
    auto catalog = m_library->snapshot();
    return json(catalog);
}
void Player::setLibrary(Library *value) {
    m_library = value;
    connect(value, &Library::changed, this, [this] { emit libraryChanged(library()); });
    connect(value, &Library::thumbnailReady, this, &Player::thumbnailReady);
}
void Player::requestThumbnail(QString id) { if (m_library) m_library->requestThumbnail(id); }
QString Player::refreshLibrary() {
    try { m_library->scan(); auto result = library(); emit libraryChanged(result); return result; }
    catch (const std::exception &e) { auto catalog = QJsonDocument::fromJson(library().toUtf8()).object(); catalog["error"] = e.what(); auto result = json(catalog); emit libraryChanged(result); return result; }
}
QString Player::playbackState() {
    QJsonArray tracks;
    for (const auto &entry : mpvProperty("track-list").toList()) {
        const auto track = entry.toMap();
        const auto type = track.value("type").toString();
        if (type == "audio" || type == "sub") tracks.append(QJsonObject{
            {"id", track.value("id").toInt()}, {"type", type},
            {"title", track.value("title").toString()}, {"lang", track.value("lang").toString()},
            {"selected", track.value("selected").toBool()}});
    }
    return json({{"id", m_current}, {"position", m_position}, {"duration", m_duration}, {"paused", flag("pause")}, {"loading", m_loading}, {"volume", number("volume")}, {"ended", flag("eof-reached")}, {"tracks", tracks}});
}
void Player::play(QString id, bool restart) {
    const auto path = m_library->resolve(id);
    if (path.isEmpty()) { emit playbackError("This movie is no longer available. Check your movie folder and refresh the library."); return; }
    persist();
    m_seekTimer.stop(); m_seekTarget = -1;
    m_current = id; m_position = 0; m_duration = 0; m_loading = true;
    const auto start = restart ? 0 : m_library->resume(id);
    QStringList load{"loadfile", path, "replace"};
    if (m_loadfileHasIndex) load.append("-1");
    load.append("start=" + QString::number(start, 'f', 3));
    command(load);
    setProperty("pause", "no");
    emit playbackChanged(playbackState());
}
void Player::pause() { command({"cycle", "pause"}); }
void Player::seek(double seconds) {
    if (m_current.isEmpty() || !std::isfinite(seconds) || m_duration <= 0) return;
    m_seekTarget = std::clamp(seconds, 0.0, m_duration);
    m_seekTimer.start();
}
void Player::seekRelative(double seconds) {
    seek((m_seekTarget >= 0 ? m_seekTarget : m_position) + seconds);
}
void Player::volume(double value) { if (std::isfinite(value)) { value = std::clamp(value, 0.0, 100.0); setProperty("volume", QString::number(value)); } }
void Player::track(QString type, int id) {
    if (type != "sub" && type != "audio") return;
    if (id < 0 && type == "audio") return;
    for (const auto &entry : mpvProperty("track-list").toList()) {
        const auto track = entry.toMap();
        if (track.value("type").toString() == type && track.value("id").toInt() == id && track.value("selected").toBool()) return;
    }
    setProperty(type == "sub" ? "sid" : "aid", id < 0 ? "no" : QString::number(id));
    // Prime the replacement audio stream at the current position. In
    // particular, a paused track change must not resume with an empty decoder.
    if (type == "audio") seek(m_seekTarget >= 0 ? m_seekTarget : m_position);
}
void Player::persist() { if (m_library) m_library->saveProgress(m_current, m_position, m_duration); }
void Player::stop() { m_seekTimer.stop(); m_seekTarget = -1; persist(); command({"stop"}); m_current.clear(); m_loading = false; m_position = m_duration = 0; emit playbackChanged(playbackState()); emit libraryChanged(library()); }
void Player::fullscreen() { if (window()) { if (window()->visibility() == QWindow::FullScreen) window()->showNormal(); else window()->showFullScreen(); } }
void Player::capture(QString path) {
    const auto dir = qEnvironmentVariable("SCREENING_ROOM_TEST_OUTPUT_DIR");
    if (!dir.isEmpty() && QFileInfo(path).fileName() == path && path.endsWith(".png") && window()) {
        QDir().mkpath(dir);
        window()->grabWindow().save(QDir(dir).filePath(path));
    }
}
void Player::testKey(QString key) {
    if (qEnvironmentVariableIsEmpty("SCREENING_ROOM_TEST_OUTPUT_DIR") || !window()) return;
    const QMap<QString, int> keys{{"Space", Qt::Key_Space}, {"Escape", Qt::Key_Escape}, {"Left", Qt::Key_Left}, {"Right", Qt::Key_Right}, {"F", Qt::Key_F}, {"S", Qt::Key_S}, {"Tab", Qt::Key_Tab}, {"Return", Qt::Key_Return}, {"Home", Qt::Key_Home}, {"End", Qt::Key_End}, {"Down", Qt::Key_Down}, {"Up", Qt::Key_Up}};
    if (!keys.contains(key)) return;
#ifdef SCREENING_ROOM_TESTING
    QTest::keyClick(window(), static_cast<Qt::Key>(keys[key]));
#endif
}
static QQuickItem *visibleControl(QQuickItem *root, const QString &name) {
    if (!root->isVisible() || !root->isEnabled()) return nullptr;
    if (root->objectName() == name) return root;
    for (auto *child : root->childItems())
        if (auto *found = visibleControl(child, name)) return found;
    return nullptr;
}
bool Player::testClick(QString objectName) {
    if (qEnvironmentVariableIsEmpty("SCREENING_ROOM_TEST_OUTPUT_DIR") || !window()) return false;
    auto *item = visibleControl(window()->contentItem(), objectName);
    if (!item) return false;
#ifdef SCREENING_ROOM_TESTING
    const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
    QTest::mouseClick(window(), Qt::LeftButton, Qt::NoModifier, point.toPoint());
    return true;
#else
    return false;
#endif
}
void Player::testFocus(QString objectName) {
    if (qEnvironmentVariableIsEmpty("SCREENING_ROOM_TEST_OUTPUT_DIR") || !window()) return;
    auto *item = visibleControl(window()->contentItem(), objectName);
    if (item && item->isVisible() && item->isEnabled()) item->forceActiveFocus();
}
QString Player::testState() {
    if (qEnvironmentVariableIsEmpty("SCREENING_ROOM_TEST_OUTPUT_DIR") || !window()) return "{}";
    const auto *popup = window()->findChild<QObject *>("tracks-popup");
    const auto *web = window()->findChild<QQuickItem *>("web");
    const auto *controls = window()->findChild<QQuickItem *>("playback-controls");
    const auto *focused = window()->activeFocusItem();
    const auto *onlineProfile = window()->findChild<QObject *>("online-profile");
    return json({{"tracksOpen", popup && popup->property("opened").toBool()},
                 {"onlineBlockedRequests", onlineProfile ? onlineProfile->property("blockedCount").toInt() : 0},
                 {"collectionVisible", web && web->isVisible()},
                 {"fullscreen", window()->visibility() == QWindow::FullScreen},
                 {"activeWindow", window()->isActive()},
                 {"focusedControl", focused ? focused->objectName() : QString()},
                 {"controlsVisible", controls && controls->property("chromeVisible").toBool()},
                 {"audioChannels", mpvProperty("audio-params").toMap().value("channel-count").toInt()},
                 {"audioOutput", mpvProperty("current-ao").toString()},
                 {"renderer", "software"},
                 {"renderedFrames", static_cast<double>(m_renderedFrames)},
                 {"seekCommands", m_seekCount},
                 {"lastSeekTarget", m_lastSeekTarget},
                 {"seeking", flag("seeking") || m_seekTimer.isActive()},
                 {"rawPause", QJsonValue::fromVariant(mpvProperty("pause"))},
                 {"audioParams", QJsonValue::fromVariant(mpvProperty("audio-params"))},
                 {"decoderDrops", number("decoder-frame-drop-count")},
                 {"outputDrops", number("frame-drop-count")},
                 {"avSync", number("avsync")},
                 {"videoFps", number("estimated-vf-fps")},
                 {"hwdec", mpvProperty("hwdec-current").toString()}});
}
static QVariant nodeValue(const mpv_node &node) {
    switch (node.format) {
    case MPV_FORMAT_STRING: return QString::fromUtf8(node.u.string);
    case MPV_FORMAT_FLAG: return node.u.flag != 0;
    case MPV_FORMAT_INT64: return QVariant::fromValue<qlonglong>(node.u.int64);
    case MPV_FORMAT_DOUBLE: return node.u.double_;
    case MPV_FORMAT_NODE_ARRAY: {
        QVariantList result;
        for (int i = 0; i < node.u.list->num; ++i) result.append(nodeValue(node.u.list->values[i]));
        return result;
    }
    case MPV_FORMAT_NODE_MAP: {
        QVariantMap result;
        for (int i = 0; i < node.u.list->num; ++i)
            result.insert(QString::fromUtf8(node.u.list->keys[i]), nodeValue(node.u.list->values[i]));
        return result;
    }
    default: return {};
    }
}
void Player::poll() {
    while (auto *event = mpv_wait_event(m_mpv, 0)) {
        if (event->event_id == MPV_EVENT_NONE) break;
        if (event->event_id == MPV_EVENT_LOG_MESSAGE) {
            const auto *message = static_cast<mpv_event_log_message *>(event->data);
            qWarning().noquote() << "mpv:" << message->prefix << QString::fromUtf8(message->text).trimmed();
        }
        if ((event->event_id == MPV_EVENT_COMMAND_REPLY || event->event_id == MPV_EVENT_SET_PROPERTY_REPLY) && event->error < 0)
            emit playbackError(QString::fromUtf8(mpv_error_string(event->error)));
        if (event->event_id == MPV_EVENT_FILE_LOADED) m_loading = false;
        if (event->event_id == MPV_EVENT_END_FILE) {
            const auto *end = static_cast<mpv_event_end_file *>(event->data);
            if (end->reason == MPV_END_FILE_REASON_ERROR) { m_loading = false; emit playbackError(QString("Playback failed: ") + mpv_error_string(end->error)); }
        }
    }
    if (!m_current.isEmpty() && !m_loading) { m_position = number("time-pos"); m_duration = number("duration"); }
}
