#include "player.h"
#include "cinepro.h"
#include "onlinefilter.h"
#include "networkremote.h"
#include "idlecursor.h"
#include <QQmlContext>
#include <QCommandLineParser>
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QEventLoop>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>
#include <clocale>
#include <iostream>

int main(int argc, char **argv) {
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    QQuickWindow::setDefaultAlphaBuffer(true);
    // Pi's GPU should composite the interface and embedded browser. Software
    // composition at a TV's 4K resolution causes heavy CPU and memory traffic.
#if defined(Q_OS_LINUX) && defined(Q_PROCESSOR_ARM_64)
    const auto defaultGraphics = QSGRendererInterface::OpenGL;
#else
    const auto defaultGraphics = QSGRendererInterface::Software;
#endif
    const auto graphics = qEnvironmentVariable("SCREENING_ROOM_GRAPHICS");
    QQuickWindow::setGraphicsApi(graphics == "software" ? QSGRendererInterface::Software :
                                graphics == "opengl" ? QSGRendererInterface::OpenGL : defaultGraphics);
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    std::setlocale(LC_NUMERIC, "C");
    app.setOrganizationName("ScreeningRoom"); app.setApplicationName("Screening Room");
    QCommandLineParser parser; parser.addHelpOption();
    const QString defaultLibrary = "/mnt/movies";
    parser.addOption({"library", "Movie folder (local or mounted NAS)", "path", defaultLibrary});
    parser.addOption({"data-dir", "Local database and artwork directory", "path", QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)});
    parser.addOption({"scan-only", "Scan the movie folder and exit"});
    parser.addOption({"offline", "Use cached metadata without calling TMDB"});
    parser.addOption({"fullscreen", "Launch full-screen"});
    parser.addOption({"cinepro", "Open the CinePro tab inside Screening Room"});
    parser.addOption({"no-network-remote", "Disable LAN remote control and discovery"});
    parser.addOption({"remote-port", "LAN remote HTTP port (Roku clients expect 8060)", "port", "8060"});
    parser.process(app);
    try {
        Library library(parser.value("library"), parser.value("data-dir"), !parser.isSet("offline"));
        QJsonObject catalog;
        try { catalog = library.scan(); }
        catch (const std::exception &e) {
            if (parser.isSet("scan-only")) throw;
            std::cerr << e.what() << '\n';
            catalog = library.snapshot();
        }
        if (parser.isSet("scan-only")) {
            if (library.metadataBusy()) {
                QEventLoop loop;
                QObject::connect(&library, &Library::metadataIdle, &loop, &QEventLoop::quit);
                loop.exec();
            }
            std::cout << QJsonDocument(library.snapshot()).toJson().toStdString(); return 0;
        }
        qmlRegisterType<Player>("ScreeningRoom", 1, 0, "VideoPlayer");
        qmlRegisterType<FilteredWebProfile>("ScreeningRoom", 1, 0, "FilteredWebProfile");
        CinePro cinepro;
        NetworkRemote remote(parser.value("data-dir"));
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("cineproSession", &cinepro);
        QFile qualityAdapter(":/native/quality-adapter.js");
        if (!qualityAdapter.open(QIODevice::ReadOnly)) throw std::runtime_error("Quality adapter is missing");
        engine.rootContext()->setContextProperty("qualityAdapterSource", QString::fromUtf8(qualityAdapter.readAll()));
        engine.rootContext()->setContextProperty("networkRemote", &remote);
        engine.load(QUrl("qrc:/native/Main.qml"));
        if (engine.rootObjects().isEmpty()) return 1;
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        new IdleCursor(window);
        auto *player = window->findChild<Player *>("player");
        player->setLibrary(&library);
        remote.setWindow(window);
        player->remoteAddresses = [&remote] { return remote.remoteUrls(); };
        QObject::connect(&cinepro, &CinePro::changed, &remote, [&] { remote.setOnline(cinepro.active()); });
        if (!parser.isSet("no-network-remote")) {
            bool valid = false;
            const auto port = parser.value("remote-port").toUShort(&valid);
            if (!valid || !port) throw std::runtime_error("Invalid remote port");
            if (!remote.start(port)) std::cerr << "Screening Room: " << remote.errorString().toStdString() << '\n';
            else std::cerr << "Screening Room network remote: HTTP " << remote.port() << ", SSDP UDP 1900\n";
        }
        if (parser.isSet("cinepro")) cinepro.setActive(true);
        if (parser.isSet("fullscreen")) window->showFullScreen();
        return app.exec();
    } catch (const std::exception &e) { std::cerr << "Screening Room: " << e.what() << '\n'; return 1; }
}
