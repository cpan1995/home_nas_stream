#include "networkremote.h"
#include <QtTest>
#include <QTcpSocket>
#include <QUdpSocket>
#include <QTemporaryDir>
#include <QFile>
#include <QXmlStreamReader>
#include <QWebSocket>
#include <QJsonDocument>
#include <QJsonObject>
#include <QCryptographicHash>

class NetworkRemoteTests : public QObject {
    Q_OBJECT
    QJsonObject exchange(QWebSocket &socket, QSignalSpy &messages, QJsonObject request) {
        messages.clear();
        request.insert("request-id", "7");
        socket.sendTextMessage(QString::fromUtf8(QJsonDocument(request).toJson(QJsonDocument::Compact)));
        QElapsedTimer timer; timer.start();
        while (messages.isEmpty() && timer.elapsed() < 1500) QTest::qWait(5);
        return messages.isEmpty() ? QJsonObject{} : QJsonDocument::fromJson(messages.takeFirst().first().toString().toUtf8()).object();
    }
    QByteArray request(NetworkRemote &remote, const QByteArray &path, const QByteArray &method = "GET", const QByteArray &headers = {}, bool *closed = nullptr) {
        if (closed) *closed = false;
        QTcpSocket socket;
        socket.connectToHost(QHostAddress::LocalHost, remote.port());
        if (!socket.waitForConnected(1000)) return {};
        socket.write(method + " " + path + " HTTP/1.1\r\nHost: 127.0.0.1:" + QByteArray::number(remote.port()) + "\r\n" + headers + "Content-Length: 0\r\n\r\n");
        QByteArray response;
        QElapsedTimer timeout; timeout.start();
        while (timeout.elapsed() < 1500) {
            QTest::qWait(5); response += socket.readAll();
            if (socket.state() == QAbstractSocket::UnconnectedState) break;
        }
        if (closed) *closed = socket.state() == QAbstractSocket::UnconnectedState;
        return response;
    }
private slots:
    void browserRemoteAssetsAndCommands() {
        QTemporaryDir dir; NetworkRemote remote(dir.path());
        QVERIFY(remote.remoteUrls().isEmpty());
        QVERIFY(remote.start(0, 0));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        const auto origin = "Origin: http://127.0.0.1:" + QByteArray::number(remote.port()) + "\r\nSec-Fetch-Site: same-origin\r\n";
        const auto page = request(remote, "/remote/");
        QVERIFY(page.contains("text/html")); QVERIFY(page.contains("id=\"trackpad\""));
        QVERIFY(page.contains("frame-ancestors 'none'"));
        QVERIFY(request(remote, "/remote/remote.js").contains("text/javascript"));
        QVERIFY(request(remote, "/remote/remote.css").contains("text/css"));
        for (const auto &key : {"Up", "Down", "Left", "Right", "Select", "Back", "Home", "CineProHome"}) {
            QVERIFY(request(remote, QByteArray("/remote/command/") + key, "POST", origin).startsWith("HTTP/1.1 200"));
            QCOMPARE(commands.last().first().toString(), QString::fromLatin1(key));
        }
        QVERIFY(request(remote, "/remote/command/Select", "POST").startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/remote/command/Select", "POST", "Origin: http://evil.example\r\n").startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/remote/command/Select", "POST", "Origin: null\r\n").startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/remote/command/Select", "POST", "Origin: http://127.0.0.1:1\r\n").startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/remote/command/Select", "GET", origin).startsWith("HTTP/1.1 404"));
        QVERIFY(request(remote, "/remote/command/PowerOff", "POST", origin).startsWith("HTTP/1.1 404"));
        QVERIFY(request(remote, "/keypress/Select", "POST", origin).startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/remote/../../native/main.cpp").startsWith("HTTP/1.1 404"));
        remote.setVolumeState(42);
        QVERIFY(request(remote, "/remote/state").contains("\"volume\":42"));
        QVERIFY(request(remote, "/remote/command/Volume_35", "POST", origin).startsWith("HTTP/1.1 200"));
        QCOMPARE(commands.last().first().toString(), QString("Volume_35"));
        for (const auto &key : {"Volume_-1", "Volume_101", "Volume_nan", "Volume_20.5"})
            QVERIFY(request(remote, QByteArray("/remote/command/") + key, "POST", origin).startsWith("HTTP/1.1 404"));
        QVERIFY(request(remote, "/remote/command/Lit_Movie%20%2F%E7%94%B5%E5%BD%B1%3F%20%2350%25", "POST", origin).startsWith("HTTP/1.1 200"));
        QCOMPARE(commands.last().first().toString(), QString::fromUtf8("Lit_Movie /电影? #50%"));
        QVERIFY(request(remote, "/remote/command/Lit_%00", "POST", origin).startsWith("HTTP/1.1 404"));
        QVERIFY(request(remote, "/remote/command/Lit_hello", "POST", "Origin: http://evil.example\r\n").startsWith("HTTP/1.1 403"));
        QCOMPARE(commands.size(), 10);
    }
    void webSocketHandshakeAndCommands() {
        QTemporaryDir dir; NetworkRemote remote(dir.path()); QVERIFY(remote.start(0, 0));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        QWebSocket socket;
        QSignalSpy messages(&socket, &QWebSocket::textMessageReceived);
        socket.open(QUrl(QString("ws://127.0.0.1:%1/ecp-session").arg(remote.port())));
        QTRY_COMPARE(messages.size(), 1);
        const auto challenge = QJsonDocument::fromJson(messages.takeFirst().first().toString().toUtf8()).object();
        QCOMPARE(challenge.value("notify").toString(), QString("authenticate"));
        const auto hash = QCryptographicHash::hash(challenge.value("param-challenge").toString().toLatin1()
            + "F3A278B8-1C6F-44A9-9D89-F1979CA4C6F1", QCryptographicHash::Sha1).toBase64();
        auto reply = exchange(socket, messages, {{"request", "authenticate"}, {"param-response", QString::fromLatin1(hash)}});
        QCOMPARE(reply.value("status").toString(), QString("200"));
        QCOMPARE(reply.value("response-id").toString(), QString("7"));
        reply = exchange(socket, messages, {{"request", "query-apps"}});
        QVERIFY(QByteArray::fromBase64(reply.value("content-data").toString().toLatin1()).contains("NAS Library"));
        reply = exchange(socket, messages, {{"request", "key-press"}, {"param-key", "up"}});
        QCOMPARE(reply.value("status").toString(), QString("200"));
        QCOMPARE(commands.last().first().toString(), QString("Up"));
        const auto literal = "Lit_" + QString::fromUtf8(QByteArray::fromHex("e794b5e5bdb1"));
        reply = exchange(socket, messages, {{"request", "key-press"}, {"param-key", literal}});
        QCOMPARE(commands.last().first().toString(), literal);
        reply = exchange(socket, messages, {{"request", "launch"}, {"param-channel-id", "cinepro"}});
        QCOMPARE(commands.last().first().toString(), QString("CinePro"));
        reply = exchange(socket, messages, {{"request", "request-events"}});
        QCOMPARE(reply.value("status").toString(), QString("200"));
        reply = exchange(socket, messages, {{"request", "key-press"}, {"param-key", "PowerOff"}});
        QCOMPARE(reply.value("status").toString(), QString("404"));
        QCOMPARE(commands.size(), 3);
        QSignalSpy pong(&socket, &QWebSocket::pong);
        socket.ping("alive"); QTRY_COMPARE(pong.size(), 1);
        // An authenticated session must outlive the old three-second HTTP timeout.
        QTest::qWait(3100);
        reply = exchange(socket, messages, {{"request", "query-device-info"}});
        QCOMPARE(reply.value("status").toString(), QString("200"));
        socket.close(); QTRY_COMPARE(socket.state(), QAbstractSocket::UnconnectedState);
    }
    void webSocketRejectsUntrustedAndOversizedMessages() {
        QTemporaryDir dir; NetworkRemote remote(dir.path()); QVERIFY(remote.start(0, 0));
        const QUrl url(QString("ws://127.0.0.1:%1/ecp-session").arg(remote.port()));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        QWebSocket untrusted("http://untrusted.example");
        QSignalSpy errors(&untrusted, &QWebSocket::errorOccurred);
        untrusted.open(url);
        QTRY_VERIFY(!errors.isEmpty());
        QCOMPARE(untrusted.state(), QAbstractSocket::UnconnectedState);
        QWebSocket unauthenticated;
        QSignalSpy messages(&unauthenticated, &QWebSocket::textMessageReceived);
        unauthenticated.open(url); QTRY_COMPARE(messages.size(), 1);
        auto reply = exchange(unauthenticated, messages, {{"request", "key-press"}, {"param-key", "Select"}});
        QCOMPARE(reply.value("status").toString(), QString("403"));
        QTRY_COMPARE(unauthenticated.state(), QAbstractSocket::UnconnectedState);
        QWebSocket invalid;
        QSignalSpy invalidMessages(&invalid, &QWebSocket::textMessageReceived);
        invalid.open(url); QTRY_COMPARE(invalidMessages.size(), 1);
        reply = exchange(invalid, invalidMessages, {{"request", "authenticate"}, {"param-response", "wrong"}});
        QCOMPARE(reply.value("status").toString(), QString("403"));
        QWebSocket oversized;
        QSignalSpy oversizedMessages(&oversized, &QWebSocket::textMessageReceived);
        oversized.open(url); QTRY_COMPARE(oversizedMessages.size(), 1);
        oversized.sendTextMessage(QString(20000, 'x'));
        QTRY_COMPARE(oversized.state(), QAbstractSocket::UnconnectedState);
        QCOMPARE(commands.size(), 0);
    }
    void discoveryAndIdentity() {
        QTemporaryDir dir;
        NetworkRemote remote(dir.path());
        QVERIFY2(remote.start(0, 0), qPrintable(remote.errorString()));
        const auto response = request(remote, "/");
        QVERIFY(response.startsWith("HTTP/1.1 200"));
        QVERIFY(response.contains("<friendlyName>Screening Room</friendlyName>"));
        const auto document = response.mid(response.indexOf("\r\n\r\n") + 4);
        QXmlStreamReader xml(document); while (!xml.atEnd()) xml.readNext(); QVERIFY(!xml.hasError());
        const auto info = request(remote, "/query/device-info");
        QVERIFY(info.contains("<supports-tv-power-control>false"));
        NetworkRemote another(dir.path()); QVERIFY(another.start(0, 0));
        QCOMPARE(request(another, "/query/device-info"), info);
        QUdpSocket search;
        QVERIFY(search.bind(QHostAddress(QHostAddress::LocalHost), 0));
        search.writeDatagram("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: roku:ecp\r\n\r\n", QHostAddress::LocalHost, remote.discoveryPort());
        QTRY_VERIFY_WITH_TIMEOUT(search.hasPendingDatagrams(), 1500);
        QByteArray packet; packet.resize(search.pendingDatagramSize()); search.readDatagram(packet.data(), packet.size());
        QVERIFY(packet.startsWith("HTTP/1.1 200 OK"));
        QVERIFY(packet.contains("ST: roku:ecp\r\n"));
        QVERIFY(packet.contains("LOCATION: http://127.0.0.1:" + QByteArray::number(remote.port()) + "/"));
    }
    void commandsAndApps() {
        QTemporaryDir dir; NetworkRemote remote(dir.path()); QVERIFY(remote.start(0, 0));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        for (const auto &key : {"Left", "Select", "Play", "VolumeDown", "Search", "Backspace", "Home"}) {
            QVERIFY(request(remote, QByteArray("/keypress/") + key, "POST").startsWith("HTTP/1.1 200"));
            QCOMPARE(commands.last().first().toString(), QString::fromLatin1(key));
        }
        QVERIFY(request(remote, "/keypress/Lit_%E7%94%B5%E5%BD%B1%20%2F%3F", "POST").startsWith("HTTP/1.1 200"));
        QCOMPARE(commands.last().first().toString(), QStringLiteral("Lit_电影 /?"));
        QVERIFY(request(remote, "/query/apps").contains("id=\"cinepro\""));
        QVERIFY(request(remote, "/launch/cinepro", "POST").startsWith("HTTP/1.1 200"));
        QCOMPARE(commands.last().first().toString(), QStringLiteral("CinePro"));
        remote.setOnline(true);
        QVERIFY(request(remote, "/query/active-app").contains("id=\"cinepro\""));
    }
    void rejectsUntrustedAndUnsupportedRequests() {
        QTemporaryDir dir; NetworkRemote remote(dir.path()); QVERIFY(remote.start(0, 0));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        QVERIFY(request(remote, "/keypress/Select", "POST", "Origin: http://evil.example\r\n").startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/keypress/Select", "POST", "Sec-Fetch-Site: cross-site\r\n").startsWith("HTTP/1.1 403"));
        QVERIFY(request(remote, "/keypress/Select", "POST", "Host: evil.example\r\n").startsWith("HTTP/1.1 400"));
        QVERIFY(request(remote, "/keypress/Select", "POST", "Transfer-Encoding: chunked\r\n").startsWith("HTTP/1.1 400"));
        for (const auto &path : {"/keypress/PowerOff", "/keypress/Lit_%00", "/launch/http%3A%2F%2Fevil.example", "/keypress/Select?url=file", "/keypress/Unknown"})
            QVERIFY(!request(remote, path, "POST").startsWith("HTTP/1.1 200"));
        QVERIFY(request(remote, "/keypress/Select").startsWith("HTTP/1.1 404"));
        QVERIFY(request(remote, "/query/device-info", "DELETE").startsWith("HTTP/1.1 405"));
        QCOMPARE(commands.size(), 0);
    }
    void fragmentedHttpAndBodyLimit() {
        QTemporaryDir dir; NetworkRemote remote(dir.path()); QVERIFY(remote.start(0, 0));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        QTcpSocket socket; socket.connectToHost(QHostAddress::LocalHost, remote.port()); QVERIFY(socket.waitForConnected(1000));
        socket.write("POST /keypress/Select HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 2\r\n\r\n");
        QTest::qWait(30); QCOMPARE(commands.size(), 0);
        socket.write("{}"); QTRY_COMPARE(commands.size(), 1);
        bool closed = false;
        const auto oversized = request(remote, "/keypress/Select", "POST", "X-Padding: " + QByteArray(16500, 'x') + "\r\n", &closed);
        // Windows may close the oversized stream before delivering the 413.
        // Require rejection and closure, never a successful command or timeout.
        QVERIFY(closed);
        QVERIFY(oversized.isEmpty() || oversized.startsWith("HTTP/1.1 413"));
        QCOMPARE(commands.size(), 1);
    }
    void heldKeyStopsAndDoesNotRepeatPlay() {
        QTemporaryDir dir; NetworkRemote remote(dir.path()); QVERIFY(remote.start(0, 0));
        QSignalSpy commands(&remote, &NetworkRemote::command);
        request(remote, "/keydown/Right", "POST"); QTest::qWait(600);
        QVERIFY(commands.size() >= 2);
        request(remote, "/keyup/Right", "POST"); const auto count = commands.size();
        QTest::qWait(300); QCOMPARE(commands.size(), count);
        request(remote, "/keydown/Play", "POST"); QTest::qWait(600); QCOMPARE(commands.size(), count + 1);
        request(remote, "/keydown/Left", "POST"); QTest::qWait(2200); const auto expired = commands.size();
        QTest::qWait(300); QCOMPARE(commands.size(), expired);
    }
    void occupiedPortDoesNotAdvertise() {
        QTemporaryDir dir; NetworkRemote first(dir.path()), second(dir.path()); QVERIFY(first.start(0, 0));
        QVERIFY(!second.start(first.port(), 0)); QVERIFY(!second.errorString().isEmpty()); QCOMPARE(second.discoveryPort(), quint16(0));
    }
};
QTEST_GUILESS_MAIN(NetworkRemoteTests)
#include "network-remote.moc"
