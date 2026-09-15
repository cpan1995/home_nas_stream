#include "cinepro.h"
#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>

CinePro::CinePro(QObject *parent) : QObject(parent) {
#ifdef SCREENING_ROOM_TESTING
    const QUrl testUrl(qEnvironmentVariable("SCREENING_ROOM_CINEPRO_TEST_URL"));
    if (testUrl.scheme() == "http" && testUrl.host() == "127.0.0.1") m_url = testUrl;
#endif
    m_timeout.setSingleShot(true);
    m_timeout.setInterval(90000);
    connect(&m_timeout, &QTimer::timeout, this, [this] {
        m_process.kill();
        fail("CinePro took too long to start. Try again.");
    });
    // Drain output without forwarding configuration or service output to the UI.
    connect(&m_process, &QProcess::readyReadStandardOutput, this, [this] { m_process.readAllStandardOutput(); });
    connect(&m_process, &QProcess::readyReadStandardError, this, [this] { m_process.readAllStandardError(); });
    connect(&m_process, &QProcess::errorOccurred, this, [this] {
        fail("CinePro could not start. Check that Node.js and the local CinePro installation are available.");
    });
    connect(&m_process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
            [this](int code, QProcess::ExitStatus status) {
        if (!m_starting) return;
        m_timeout.stop();
        m_starting = false;
        m_ready = code == 0 && status == QProcess::NormalExit;
        if (!m_ready) m_error = "CinePro is unavailable. Check the connection and try again.";
        emit changed();
    });
}

CinePro::~CinePro() {
    if (m_process.state() != QProcess::NotRunning) {
        m_process.kill();
        m_process.waitForFinished(1000);
    }
}

void CinePro::setActive(bool value) {
    if (m_active == value) return;
    m_active = value;
    emit changed();
    if (value && !m_ready && !m_starting) start();
}

void CinePro::fail(const QString &message) {
    m_timeout.stop();
    m_ready = false;
    m_starting = false;
    m_error = message;
    emit changed();
}

void CinePro::start() {
    if (m_starting || m_process.state() != QProcess::NotRunning) return;
    m_starting = true;
    m_ready = false;
    m_error.clear();
    emit changed();
    QUrl health = m_url;
    health.setPath("/api/local/health");
    health.setQuery(QString());
    QNetworkRequest request(health);
    request.setTransferTimeout(2500);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const bool healthy = reply->error() == QNetworkReply::NoError &&
            QJsonDocument::fromJson(reply->readAll()).object().value("application") == "cinepro-local-ui";
        reply->deleteLater();
        if (healthy) {
            m_starting = false;
            m_ready = true;
            emit changed();
        } else launch();
    });
}

void CinePro::launch() {
#ifdef SCREENING_ROOM_TESTING
    if (qEnvironmentVariableIsSet("SCREENING_ROOM_CINEPRO_TEST_URL")) {
        fail("CinePro is unavailable. Check the connection and try again.");
        return;
    }
#endif
    QDir directory(QCoreApplication::applicationDirPath());
    QString script;
    for (int depth = 0; depth < 4; ++depth) {
        const QString candidate = directory.filePath("scripts/cinepro-launch.mjs");
        if (QFileInfo::exists(candidate)) { script = candidate; break; }
        directory.cdUp();
    }
    if (script.isEmpty()) {
        fail("The local CinePro installation could not be found. Restore it, then try again.");
        return;
    }
    m_process.setWorkingDirectory(directory.absolutePath());
    m_process.start("node", {script, "--ui-only"});
    m_timeout.start();
}
