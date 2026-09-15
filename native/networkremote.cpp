#include "networkremote.h"
#include <QWebSocket>
#include <QWebSocketCorsAuthenticator>
#include <QCryptographicHash>
#include <QJsonDocument>
#include <QJsonObject>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QSaveFile>
#include <QKeyEvent>
#include <QInputMethodEvent>
#include <QQuickItem>
#include <QNetworkInterface>
#include <QNetworkDatagram>
#include <QQuickWindow>
#include <QTcpSocket>
#include <QUrl>
#include <QUuid>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QDebug>
#include <QDateTime>

namespace {
const QHostAddress multicast(QStringLiteral("239.255.255.250"));
const QByteArray service("roku:ecp");
const QByteArray server("Linux/1.0 UPnP/1.0 Roku/14.0 ScreeningRoom/0.1");
QString xml(const QString &text) { return text.toHtmlEscaped(); }
QList<QNetworkInterface> interfaces() {
    QList<QNetworkInterface> result;
    for (const auto &iface : QNetworkInterface::allInterfaces()) {
        const auto flags = iface.flags();
        if (flags.testFlag(QNetworkInterface::IsUp) && flags.testFlag(QNetworkInterface::IsRunning)
            && !flags.testFlag(QNetworkInterface::IsLoopBack)) result.append(iface);
    }
    return result;
}
}

NetworkRemote::NetworkRemote(const QString &dataDir, QObject *parent) : QObject(parent) {
    m_debug = qEnvironmentVariableIntValue("SCREENING_ROOM_REMOTE_DEBUG") == 1;
    m_webSockets.setHandshakeTimeout(3000);
    m_webSockets.setMaxPendingConnections(16);
    m_webSockets.setSupportedSubprotocols({"ecp-2"});
    connect(&m_webSockets, &QWebSocketServer::newConnection, this, &NetworkRemote::acceptSessions);
    QDir().mkpath(dataDir);
    const auto path = QDir(dataDir).filePath("remote-device-id");
    QFile stored(path);
    if (stored.open(QIODevice::ReadOnly)) m_id = QString::fromUtf8(stored.read(100)).trimmed();
    if (QUuid(m_id).isNull()) {
        m_id = QUuid::createUuid().toString(QUuid::WithoutBraces);
        QSaveFile file(path);
        if (file.open(QIODevice::WriteOnly)) {
            file.write(m_id.toUtf8());
            if (!file.commit()) qWarning() << "Could not persist the remote device ID";
        }
    }
    m_budget.start();
    connect(&m_http, &QTcpServer::newConnection, this, &NetworkRemote::acceptConnections);
    connect(&m_ssdp, &QUdpSocket::readyRead, this, &NetworkRemote::discover);
    m_announce.setInterval(60000);
    connect(&m_announce, &QTimer::timeout, this, [this] { announce(true); });
    m_interfaces.setInterval(10000);
    connect(&m_interfaces, &QTimer::timeout, this, &NetworkRemote::refreshInterfaces);
    m_repeat.setInterval(120);
    connect(&m_repeat, &QTimer::timeout, this, [this] { if (!m_held.isEmpty()) emit command(m_held); });
    m_release.setSingleShot(true);
    m_release.setInterval(2000);
    connect(&m_release, &QTimer::timeout, this, [this] { m_repeat.stop(); m_held.clear(); });
}

NetworkRemote::~NetworkRemote() {
    announce(false);
    const auto sessions = m_sessions;
    for (auto *socket : sessions) { disconnect(socket, nullptr, this, nullptr); delete socket; }
    // Disconnect callbacks before the server and its sockets are destroyed.
    for (auto *socket : m_clients) disconnect(socket, nullptr, this, nullptr);
}

bool NetworkRemote::start(quint16 httpPort, quint16 discoveryPort) {
    if (!m_http.listen(QHostAddress::AnyIPv4, httpPort)) {
        m_error = QStringLiteral("Remote control port %1: %2").arg(httpPort).arg(m_http.errorString());
        return false;
    }
    if (!m_ssdp.bind(QHostAddress::AnyIPv4, discoveryPort, QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint)) {
        m_error = QStringLiteral("Remote discovery port %1: %2").arg(discoveryPort).arg(m_ssdp.errorString());
        m_http.close();
        return false;
    }
    m_ssdp.setSocketOption(QAbstractSocket::MulticastTtlOption, 2);
    refreshInterfaces();
    m_interfaces.start();
    m_announce.start();
    return true;
}

QStringList NetworkRemote::remoteUrls() const {
    QStringList urls;
    if (!m_http.isListening()) return urls;
    for (const auto &iface : interfaces()) for (const auto &entry : iface.addressEntries()) {
        if (entry.ip().protocol() != QAbstractSocket::IPv4Protocol || entry.ip().isLinkLocal()) continue;
        const auto url = QString("http://%1:%2/remote/").arg(entry.ip().toString()).arg(port());
        if (!urls.contains(url)) urls.append(url);
    }
    return urls;
}

void NetworkRemote::setWindow(QQuickWindow *window) { m_window = window; }

bool NetworkRemote::localPeer(const QHostAddress &address) const {
    if (address.isLoopback()) return true;
    if (address.protocol() != QAbstractSocket::IPv4Protocol || address.isMulticast() || address == QHostAddress::Broadcast) return false;
    for (const auto &iface : interfaces()) for (const auto &entry : iface.addressEntries())
        if (entry.ip().protocol() == QAbstractSocket::IPv4Protocol && entry.prefixLength() > 0
            && address.isInSubnet(entry.ip(), entry.prefixLength())) return true;
    return false;
}

QString NetworkRemote::addressFor(const QHostAddress &peer) const {
    if (peer.isLoopback()) return QStringLiteral("127.0.0.1");
    for (const auto &iface : interfaces()) for (const auto &entry : iface.addressEntries())
        if (entry.ip().protocol() == QAbstractSocket::IPv4Protocol && entry.prefixLength() > 0
            && peer.isInSubnet(entry.ip(), entry.prefixLength())) return entry.ip().toString();
    return {};
}

void NetworkRemote::refreshInterfaces() {
    if (m_ssdp.localPort() != 1900) return; // Isolated tests use an ephemeral discovery port.
    QSet<int> current;
    bool changed = false;
    for (const auto &iface : interfaces()) {
        if (!iface.flags().testFlag(QNetworkInterface::CanMulticast)) continue;
        bool ipv4 = false;
        for (const auto &entry : iface.addressEntries()) ipv4 |= entry.ip().protocol() == QAbstractSocket::IPv4Protocol;
        if (!ipv4) continue;
        current.insert(iface.index());
        if (!m_joined.contains(iface.index()) && m_ssdp.joinMulticastGroup(multicast, iface)) {
            m_joined.insert(iface.index()); changed = true;
        }
    }
    for (const auto index : m_joined - current) {
        m_ssdp.leaveMulticastGroup(multicast, QNetworkInterface::interfaceFromIndex(index));
        m_joined.remove(index);
    }
    if (changed) announce(true);
}

void NetworkRemote::announce(bool alive) {
    if (!m_http.isListening()) return;
    for (const auto &iface : interfaces()) {
        if (!m_joined.contains(iface.index())) continue;
        m_ssdp.setMulticastInterface(iface);
        for (const auto &entry : iface.addressEntries()) {
            if (entry.ip().protocol() != QAbstractSocket::IPv4Protocol) continue;
            const auto location = QString("http://%1:%2/").arg(entry.ip().toString()).arg(port()).toUtf8();
            const auto packet = "NOTIFY * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nCACHE-CONTROL: max-age=120\r\n"
                "LOCATION: " + location + "\r\nNT: " + service + "\r\nNTS: ssdp:" + (alive ? "alive" : "byebye")
                + "\r\nUSN: uuid:roku:ecp:" + m_id.toUtf8() + "\r\nSERVER: " + server + "\r\n\r\n";
            m_ssdp.writeDatagram(packet, multicast, 1900);
        }
    }
}

void NetworkRemote::discover() {
    while (m_ssdp.hasPendingDatagrams()) {
        if (m_ssdp.pendingDatagramSize() > 2048) { m_ssdp.receiveDatagram(0); continue; }
        const auto datagram = m_ssdp.receiveDatagram();
        if (!localPeer(datagram.senderAddress()) || datagram.senderPort() < 1024) continue;
        if (m_budget.elapsed() >= 1000) { m_budget.restart(); m_requests = m_searches = 0; }
        const auto lines = datagram.data().split('\n');
        if (lines.isEmpty() || lines.first().trimmed() != "M-SEARCH * HTTP/1.1") continue;
        QMap<QByteArray, QByteArray> headers;
        for (const auto &line : lines.mid(1)) {
            const auto colon = line.indexOf(':');
            if (colon > 0) headers[line.left(colon).trimmed().toLower()] = line.mid(colon + 1).trimmed();
        }
        const auto st = headers.value("st");
        if (headers.value("man").toLower() != "\"ssdp:discover\""
            || (st != service && st != "ssdp:all" && st != "upnp:rootdevice")) continue;
        if (++m_searches > 20) continue;
        const auto address = addressFor(datagram.senderAddress());
        if (address.isEmpty()) continue;
        if (m_debug) qInfo().noquote() << "Network remote discovery:" << datagram.senderAddress().toString() << "ST=" << st;
        const auto packet = "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=120\r\nEXT:\r\nLOCATION: http://"
            + address.toUtf8() + ":" + QByteArray::number(port()) + "/\r\nSERVER: " + server
            + "\r\nST: " + (st == "upnp:rootdevice" ? st : service)
            + "\r\nUSN: uuid:roku:ecp:" + m_id.toUtf8() + "\r\n\r\n";
        const int mx = qBound(1, headers.value("mx").toInt(), 3);
        QTimer::singleShot(QRandomGenerator::global()->bounded(mx * 1000), this, [this, datagram, packet] {
            m_ssdp.writeDatagram(packet, datagram.senderAddress(), datagram.senderPort());
        });
    }
}

QByteArray NetworkRemote::description(const QString &address) const {
    return (QStringLiteral("<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion><device>")
        + "<deviceType>urn:roku-com:device:player:1-0</deviceType><friendlyName>Screening Room</friendlyName>"
          "<manufacturer>Screening Room</manufacturer><modelDescription>Roku-compatible remote receiver</modelDescription>"
          "<modelName>Screening Room</modelName><modelNumber>SR-Pi</modelNumber><serialNumber>" + xml(m_id)
        + "</serialNumber><UDN>uuid:roku:ecp:" + xml(m_id) + "</UDN><serviceList><service>"
          "<serviceType>roku:ecp</serviceType><serviceId>urn:roku-com:serviceId:ecp1-0</serviceId>"
          "<controlURL>/</controlURL><eventSubURL/><SCPDURL>ecp_SCPD.xml</SCPDURL></service></serviceList>"
          "<presentationURL>http://" + xml(address) + ":" + QString::number(port()) + "/</presentationURL></device></root>").toUtf8();
}

QByteArray NetworkRemote::deviceInfo() const {
    return (QStringLiteral("<?xml version=\"1.0\"?><device-info><udn>") + xml(m_id) + "</udn><serial-number>" + xml(m_id)
        + "</serial-number><device-id>" + xml(m_id) + "</device-id><vendor-name>Screening Room</vendor-name>"
          "<model-name>Screening Room</model-name><model-number>SR-Pi</model-number><model-description>Roku-compatible remote receiver</model-description>"
          "<friendly-device-name>Screening Room</friendly-device-name><user-device-name>Screening Room</user-device-name>"
          "<user-device-location>Screening Room</user-device-location><software-version>14.0.0</software-version>"
          "<software-build>0</software-build><is-tv>false</is-tv><is-stick>false</is-stick><power-mode>PowerOn</power-mode>"
          "<supports-eth>true</supports-eth><supports-wifi>true</supports-wifi><supports-private-listening>false</supports-private-listening>"
          "<supports-tv-power-control>false</supports-tv-power-control><supports-tv-volume-control>false</supports-tv-volume-control>"
          "<supports-audio-guide>false</supports-audio-guide><supports-voice-search>false</supports-voice-search>"
          "<supports-text-input>true</supports-text-input><supports-find-remote>false</supports-find-remote></device-info>").toUtf8();
}

void NetworkRemote::acceptConnections() {
    while (auto *socket = m_http.nextPendingConnection()) {
        socket->setReadBufferSize(16385);
        if (m_debug) qInfo().noquote() << "Network remote connection:" << socket->peerAddress().toString() << "local-peer=" << localPeer(socket->peerAddress());
        if (!localPeer(socket->peerAddress()) || m_clients.size() + m_sessions.size() >= 16) {
            socket->abort(); socket->deleteLater(); continue;
        }
        m_clients.insert(socket);
        connect(socket, &QTcpSocket::disconnected, this, [this, socket] {
            m_clients.remove(socket);
            if (!socket->property("websocket").toBool()) socket->deleteLater();
        });
        connect(socket, &QObject::destroyed, this, [this, socket] { m_clients.remove(socket); });
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] { readRequest(socket); });
        QTimer::singleShot(3000, socket, [socket] { if (!socket->property("websocket").toBool()) socket->abort(); });
    }
}

void NetworkRemote::reply(QTcpSocket *socket, int status, const QByteArray &body, const QByteArray &type) {
    socket->readAll();
    socket->setProperty("replied", true);
    if (m_debug) qInfo().noquote() << "Network remote request:" << socket->peerAddress().toString()
        << socket->property("request-method").toString() << socket->property("request-route").toString()
        << "status=" << status << "host-valid=" << socket->property("host-valid").toBool()
        << "origin=" << socket->property("has-origin").toBool() << "fetch-metadata=" << socket->property("has-fetch").toBool();
    const QMap<int, QByteArray> reasons{{200,"OK"},{400,"Bad Request"},{403,"Forbidden"},{404,"Not Found"},{405,"Method Not Allowed"},{413,"Payload Too Large"},{429,"Too Many Requests"}};
    socket->write("HTTP/1.1 " + QByteArray::number(status) + " " + reasons.value(status) + "\r\nContent-Type: " + type
        + "\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'\r\n\r\n" + body);
    socket->disconnectFromHost();
}

void NetworkRemote::readRequest(QTcpSocket *socket) {
    if (socket->property("replied").toBool()) return;
    // Keep the handshake unread so Qt WebSockets can take over the same socket.
    const auto data = socket->peek(16385);
    if (data.size() > 16384) { reply(socket, 413); return; }
    const auto end = data.indexOf("\r\n\r\n");
    if (end < 0) return;
    const auto lines = data.left(end).split('\n');
    const auto first = lines.first().trimmed().split(' ');
    if (first.size() != 3 || (first[2] != "HTTP/1.1" && first[2] != "HTTP/1.0") || !first[1].startsWith('/')) { reply(socket, 400); return; }
    if (m_debug) {
        socket->setProperty("request-method", first[0].left(10));
        const auto path = QString::fromLatin1(first[1].split('?').first());
        // Log protocol endpoints only, never typed text, query values, or headers.
        const auto match = QRegularExpression("^/(?:query/[a-z-]+|keypress|keydown|keyup|launch|ecp-session|icon|images|ecp_SCPD\\.xml|device\\.xml)(?:/|$)").match(path);
        socket->setProperty("request-route", path == "/" ? path : match.hasMatch() ? match.captured().chopped(match.captured().endsWith('/') ? 1 : 0) : QStringLiteral("[other]"));
    }
    QMap<QByteArray, QByteArray> headers;
    for (const auto &line : lines.mid(1)) {
        const int colon = line.indexOf(':');
        const auto name = line.left(colon).trimmed().toLower();
        if (colon <= 0 || headers.contains(name)) { reply(socket, 400); return; }
        headers.insert(name, line.mid(colon + 1).trimmed());
    }
    // Browser pages cannot control the player via cross-origin POSTs or DNS rebinding.
    const auto host = QString::fromLatin1(headers.value("host")).section(':', 0, 0);
    const QHostAddress hostIp(host);
    bool ownHost = host == "localhost" && socket->peerAddress().isLoopback();
    for (const auto &ip : QNetworkInterface::allAddresses()) ownHost |= ip == hostIp;
    socket->setProperty("host-valid", ownHost);
    socket->setProperty("has-origin", headers.contains("origin"));
    socket->setProperty("has-fetch", headers.contains("sec-fetch-site"));
    const auto expectedOrigin = "http://" + headers.value("host");
    const bool browserCommand = first[1].startsWith("/remote/command/");
    const bool ownBrowser = headers.value("origin") == expectedOrigin
        && QUrl(QString::fromLatin1(expectedOrigin)).port(80) == port()
        && (!headers.contains("sec-fetch-site") || headers.value("sec-fetch-site") == "same-origin");
    if (browserCommand && !ownBrowser) { reply(socket, 403); return; }
    if (!ownHost || (!browserCommand && first[0] != "GET" && (headers.contains("origin") || headers.contains("sec-fetch-site")))) { reply(socket, 403); return; }
    if (headers.contains("transfer-encoding")) { reply(socket, 400); return; }
    bool validLength = true;
    const auto length = headers.contains("content-length") ? headers.value("content-length").toLongLong(&validLength) : 0;
    if (!validLength || length < 0) { reply(socket, 400); return; }
    if (length > 1024) { reply(socket, 413); return; }
    if (data.size() < end + 4 + length) return;
    if (m_budget.elapsed() >= 1000) { m_budget.restart(); m_requests = m_searches = 0; }
    if (++m_requests > 60) { reply(socket, 429); return; }
    const auto uri = QUrl::fromEncoded(first[1], QUrl::StrictMode);
    if (!uri.isValid() || uri.hasQuery() || uri.hasFragment()) { reply(socket, 400); return; }
    const auto path = uri.path();
    if (first[0] == "GET" && path == "/ecp-session") {
        const QUrl origin(QString::fromLatin1(headers.value("origin")));
        const bool ownOrigin = origin.scheme() == "http" && QHostAddress(origin.host()) == socket->localAddress()
            && origin.port(80) == port() && origin.userInfo().isEmpty() && !origin.hasQuery() && !origin.hasFragment();
        if ((headers.contains("origin") && !ownOrigin) || headers.contains("sec-fetch-site")) { reply(socket, 403); return; }
        if (headers.value("upgrade").toLower() != "websocket" || length != 0) { reply(socket, 400); return; }
        socket->setProperty("websocket", true);
        m_clients.remove(socket);
        disconnect(socket, nullptr, this, nullptr);
        if (m_debug) qInfo().noquote() << "Network remote WebSocket upgrade:" << socket->peerAddress().toString();
        m_webSockets.handleConnection(socket);
        return;
    }
    if (first[0] == "POST" && path.startsWith("/remote/command/")) {
        const auto key = path.mid(16);
        static const QSet<QString> webKeys{"Up", "Down", "Left", "Right", "Select", "Back", "Home", "CineProHome", "Search", "Backspace", "Enter"};
        if ((!webKeys.contains(key) && !(key.startsWith("Lit_") && allowedKey(key)) && !QRegularExpression("^Volume_(?:[0-9]|[1-9][0-9]|100)$").match(key).hasMatch()) || length != 0) { reply(socket, 404); return; }
        dispatch(key, "keypress");
        reply(socket, 200, "{}", "application/json");
        return;
    }
    if (first[0] == "GET") {
        if (path == "/remote/state") {
            reply(socket, 200, QJsonDocument(QJsonObject{{"volume", m_volume}}).toJson(QJsonDocument::Compact), "application/json");
        }
        else if (path == "/remote/" || path == "/remote" || path == "/remote/remote.css" || path == "/remote/remote.js") {
            const auto name = path.endsWith(".css") ? "remote.css" : path.endsWith(".js") ? "remote.js" : "index.html";
            QFile file(QString(":/public/remote/") + name);
            if (!file.open(QIODevice::ReadOnly)) { reply(socket, 404); return; }
            reply(socket, 200, file.readAll(), path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8");
        }
        else if (path == "/" || path == "/device.xml") reply(socket, 200, description(socket->localAddress().toString()));
        else if (!queryContent(path).isNull()) reply(socket, 200, queryContent(path));
        else reply(socket, 404);
        return;
    }
    if (first[0] != "POST") { reply(socket, 405); return; }
    // Split before decoding: a typed slash is a character, not an endpoint separator.
    const auto pieces = QString::fromLatin1(first[1]).split('/');
    if (pieces.size() != 3) { reply(socket, 404); return; }
    const auto action = pieces[1], key = QUrl::fromPercentEncoding(pieces[2].toLatin1());
    if (action == "launch" && (key == "screening-room" || key == "cinepro")) {
        emit command(key == "cinepro" ? "CinePro" : "Home"); reply(socket, 200); return;
    }
    if ((action != "keypress" && action != "keydown" && action != "keyup") || !allowedKey(key)) { reply(socket, 404); return; }
    dispatch(key, action);
    reply(socket, 200);
}

QByteArray NetworkRemote::queryContent(const QString &path) const {
    if (path == "/query/device-info") return deviceInfo();
    if (path == "/query/apps") return "<?xml version=\"1.0\"?><apps><app id=\"screening-room\" type=\"appl\" version=\"1.0\">NAS Library</app><app id=\"cinepro\" type=\"appl\" version=\"1.0\">CinePro</app></apps>";
    if (path == "/query/active-app") return m_online ? "<active-app><app id=\"cinepro\" type=\"appl\" version=\"1.0\">CinePro</app></active-app>" : "<active-app><app id=\"screening-room\" type=\"appl\" version=\"1.0\">NAS Library</app></active-app>";
    return {};
}

void NetworkRemote::acceptSessions() {
    while (auto *socket = m_webSockets.nextPendingConnection()) {
        if (m_sessions.size() >= 16) { socket->close(QWebSocketProtocol::CloseCodePolicyViolated); socket->deleteLater(); continue; }
        m_sessions.insert(socket);
        socket->setParent(this);
        socket->setMaxAllowedIncomingFrameSize(16384);
        socket->setMaxAllowedIncomingMessageSize(16384);
        socket->setReadBufferSize(32768);
        connect(socket, &QWebSocket::aboutToClose, socket, [socket] {
            // Stop parsing rejected oversized frames immediately. Qt otherwise
            // keeps reading their payload while waiting for the close handshake.
            if (socket->closeCode() == QWebSocketProtocol::CloseCodeTooMuchData
                && !socket->property("aborting").toBool()) {
                socket->setProperty("aborting", true);
                socket->abort();
            }
        });
        const auto challenge = QUuid::createUuid().toRfc4122().toBase64();
        socket->setProperty("challenge", challenge);
        connect(socket, &QWebSocket::disconnected, this, [this, socket] {
            if (m_debug) qInfo().noquote() << "Network remote WebSocket closed:" << QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)
                << "code=" << int(socket->closeCode()) << "authenticated=" << socket->property("authenticated").toBool()
                << "awaiting-pong=" << socket->property("awaiting-pong").toBool();
            m_sessions.remove(socket); socket->deleteLater();
        });
        connect(socket, &QWebSocket::textMessageReceived, this, [this, socket](const QString &message) { sessionMessage(socket, message); });
        connect(socket, &QWebSocket::binaryMessageReceived, socket, [socket] { socket->close(QWebSocketProtocol::CloseCodeDatatypeNotSupported); });
        connect(socket, &QWebSocket::pong, socket, [socket] { socket->setProperty("awaiting-pong", false); });
        auto *heartbeat = new QTimer(socket);
        heartbeat->setInterval(30000);
        connect(heartbeat, &QTimer::timeout, socket, [socket] {
            if (socket->property("awaiting-pong").toBool()) { socket->abort(); return; }
            socket->setProperty("awaiting-pong", true); socket->ping();
        });
        heartbeat->start();
        QTimer::singleShot(5000, socket, [socket] { if (!socket->property("authenticated").toBool()) socket->close(QWebSocketProtocol::CloseCodePolicyViolated); });
        socket->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"notify", "authenticate"},
            {"param-challenge", QString::fromLatin1(challenge)}, {"timestamp", QString::number(m_budget.elapsed() / 1000.0, 'f', 3)}}).toJson(QJsonDocument::Compact)));
    }
}

void NetworkRemote::sessionMessage(QWebSocket *socket, const QString &message) {
    if (m_budget.elapsed() >= 1000) { m_budget.restart(); m_requests = m_searches = 0; }
    if (++m_requests > 60 || socket->bytesToWrite() > 65536) { socket->close(QWebSocketProtocol::CloseCodePolicyViolated); return; }
    const auto document = QJsonDocument::fromJson(message.toUtf8());
    const auto input = document.object();
    const auto request = input.value("request").toString();
    const auto id = input.value("request-id").toVariant().toString();
    if (!document.isObject() || id.size() > 64 || !QRegularExpression("^[a-z-]{1,64}$").match(request).hasMatch()) {
        socket->close(QWebSocketProtocol::CloseCodeProtocolError); return;
    }
    int status = 200;
    QByteArray content;
    QString type = "text/xml; charset=utf-8";
    if (request == "authenticate") {
        const auto expected = QCryptographicHash::hash(socket->property("challenge").toByteArray()
            + "F3A278B8-1C6F-44A9-9D89-F1979CA4C6F1", QCryptographicHash::Sha1).toBase64();
        const bool valid = input.value("param-response").toString().toLatin1() == expected;
        socket->setProperty("authenticated", valid);
        if (!valid) status = 403;
    } else if (!socket->property("authenticated").toBool()) status = 403;
    else if (request.startsWith("query-")) {
        content = queryContent("/query/" + request.mid(6));
        if (request == "query-textedit-state") { type = "application/json"; content = "{\"textedit-state\":{\"textedit-id\":\"none\"}}"; }
        if (content.isNull()) status = 404;
    } else if (request == "key-press" || request == "key-down" || request == "key-up") {
        auto key = input.value("param-key").toString();
        for (const auto &known : {"Home","Back","Select","Left","Right","Down","Up","Rev","Fwd","Play","Info","Backspace","Enter","VolumeDown","VolumeUp","VolumeMute","Search","InstantReplay"})
            if (key.compare(QLatin1String(known), Qt::CaseInsensitive) == 0) { key = QLatin1String(known); break; }
        if (!allowedKey(key)) {
            status = 404;
            if (m_debug && QRegularExpression("^[A-Za-z-]{1,32}$").match(key).hasMatch())
                qInfo().noquote() << "Network remote unsupported button:" << key;
        }
        else dispatch(key, request == "key-down" ? "keydown" : request == "key-up" ? "keyup" : "keypress");
    } else if (request == "launch") {
        const auto channel = input.value("param-channel-id").toString();
        if (channel == "cinepro" || channel == "screening-room") emit command(channel == "cinepro" ? "CinePro" : "Home");
        else status = 404;
    } else if (request != "request-events") status = 404;
    QJsonObject response{{"response", request}, {"response-id", id}, {"status", QString::number(status)},
        {"status-msg", status == 200 ? "OK" : status == 403 ? "Forbidden" : "Not Found"}};
    if (!content.isNull()) { response.insert("content-type", type); response.insert("content-data", QString::fromLatin1(content.toBase64())); }
    if (m_debug) qInfo().noquote() << "Network remote WebSocket request:" << socket->peerAddress().toString() << request << "status=" << status;
    socket->sendTextMessage(QString::fromUtf8(QJsonDocument(response).toJson(QJsonDocument::Compact)));
    if (status == 403) socket->close(QWebSocketProtocol::CloseCodePolicyViolated);
}

bool NetworkRemote::allowedKey(const QString &key) const {
    static const QSet<QString> keys{"Home","Back","Select","Left","Right","Down","Up","Rev","Fwd","Play","Info","Backspace","Enter","VolumeDown","VolumeUp","VolumeMute","Search","InstantReplay"};
    if (keys.contains(key)) return true;
    if (!key.startsWith("Lit_") || key.size() <= 4 || key.size() > 260) return false;
    for (const auto ch : key.mid(4)) if (ch.isNull() || ch.category() == QChar::Other_Control) return false;
    return true;
}

void NetworkRemote::dispatch(const QString &key, const QString &action) {
    // Record button names for diagnosing remote stalls; never record typed text.
    const auto label = key.startsWith("Lit_") ? QStringLiteral("[text]") : key;
    if (m_debug) qInfo().noquote() << "Network remote button:" << QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)
        << action << label;
    if (action == "keyup") {
        if (m_held == key) { ++m_holdGeneration; m_repeat.stop(); m_release.stop(); m_held.clear(); }
        return;
    }
    m_repeat.stop(); m_release.stop(); m_held.clear();
    const auto generation = ++m_holdGeneration;
    QElapsedTimer elapsed; elapsed.start();
    emit command(key);
    if (m_debug && elapsed.elapsed() >= 250)
        qInfo().noquote() << "Network remote slow command:" << label << "elapsed-ms=" << elapsed.elapsed();
    static const QSet<QString> repeatable{"Left","Right","Up","Down","VolumeUp","VolumeDown","Backspace"};
    if (action == "keydown" && repeatable.contains(key)) {
        m_held = key; m_release.start();
        QTimer::singleShot(350, this, [this, key, generation] { if (m_held == key && m_holdGeneration == generation) m_repeat.start(); });
    }
}

void NetworkRemote::sendKey(QString name) {
    if (!m_window) return;
    static const QMap<QString, int> keys{{"Left",Qt::Key_Left},{"Right",Qt::Key_Right},{"Up",Qt::Key_Up},{"Down",Qt::Key_Down},
        {"Select",Qt::Key_Return},{"Enter",Qt::Key_Return},{"Back",Qt::Key_Escape},{"Backspace",Qt::Key_Backspace},
        {"Play",Qt::Key_Space},{"Info",Qt::Key_S},{"VolumeUp",Qt::Key_VolumeUp},{"VolumeDown",Qt::Key_VolumeDown},{"VolumeMute",Qt::Key_VolumeMute}};
    const bool literal = name.startsWith("Lit_") && allowedKey(name);
    if (!literal && !keys.contains(name)) return;
    if (literal) {
        if (auto *focus = m_window->activeFocusItem()) {
            QInputMethodEvent input;
            input.setCommitString(name.mid(4));
            QCoreApplication::sendEvent(focus, &input);
        }
        return;
    }
    const auto text = name == "Play" ? QStringLiteral(" ") : QString();
    const int key = keys[name];
    QKeyEvent press(QEvent::KeyPress, key, Qt::NoModifier, text);
    QKeyEvent release(QEvent::KeyRelease, key, Qt::NoModifier, text);
    QCoreApplication::sendEvent(m_window, &press);
    QCoreApplication::sendEvent(m_window, &release);
}
