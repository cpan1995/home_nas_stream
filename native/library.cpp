#include "library.h"
#include <QCryptographicHash>
#include <QDir>
#include <QDirIterator>
#include <QDateTime>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QRegularExpression>
#include <QSaveFile>
#include <QSqlError>
#include <QSqlQuery>
#include <QUrl>
#include <QTimer>
#include <stdexcept>

static QByteArray run(const QString &program, const QStringList &args, int timeout) {
    QProcess process;
    process.start(program, args);
    if (!process.waitForFinished(timeout)) { process.kill(); process.waitForFinished(); return {}; }
    if (process.exitCode() != 0) return {};
    return process.readAllStandardOutput();
}

static QString readToken(const QString &) {
    auto token = qEnvironmentVariable("TMDB_READ_ACCESS_TOKEN").trimmed();
    if (!token.isEmpty()) return token;
    QFile file(qEnvironmentVariable("SCREENING_ROOM_STREAM_CONFIG", QDir::currentPath() + "/.local/stream-providers.env"));
    if (!file.open(QIODevice::ReadOnly)) return {};
    for (auto line : file.readAll().split('\n')) {
        line = line.trimmed();
        if (!line.startsWith("TMDB_READ_ACCESS_TOKEN=")) continue;
        auto value = QString::fromUtf8(line.mid(23)).trimmed();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) value = value.mid(1, value.size() - 2);
        return value;
    }
    return {};
}

Library::Library(QString root, QString dataDir, bool online, TmdbClient *client)
    : m_root(QDir(root).absolutePath()), m_dataDir(QDir(dataDir).absolutePath()) {
    m_library = {{"movies", QJsonArray()}, {"path", m_root}};
    QDir().mkpath(m_dataDir);
    m_db = QSqlDatabase::addDatabase("QSQLITE", m_dataDir);
    m_db.setDatabaseName(m_dataDir + "/library.sqlite");
    if (!m_db.open()) throw std::runtime_error(m_db.lastError().text().toStdString());
    QSqlQuery q(m_db);
    if (!q.exec("CREATE TABLE IF NOT EXISTS movies (id TEXT PRIMARY KEY, path TEXT NOT NULL, stamp TEXT, metadata TEXT, position REAL DEFAULT 0, duration REAL DEFAULT 0)"))
        throw std::runtime_error(q.lastError().text().toStdString());
    if (!q.exec("CREATE TABLE IF NOT EXISTS tmdb_metadata (id TEXT PRIMARY KEY, stamp TEXT NOT NULL, metadata TEXT NOT NULL, status TEXT NOT NULL, checked_at INTEGER NOT NULL)"))
        throw std::runtime_error(q.lastError().text().toStdString());
    m_tmdb = client ? client : new TmdbClient(online ? readToken(m_dataDir) : QString(), this);
    connect(m_tmdb, &TmdbClient::resolved, this, &Library::applyMetadata);
    connect(m_tmdb, &TmdbClient::idle, this, &Library::metadataIdle);
}

QJsonObject Library::scan() {
    if (!QFileInfo(m_root).isDir() || !QFileInfo(m_root).isReadable()) {
        m_library["error"] = "Movie folder is unavailable. Check the NAS connection or library path.";
        throw std::runtime_error("Movie folder is unavailable. Check the NAS connection or library path.");
    }
    QJsonArray movies;
    const QStringList extensions = {"mkv", "mp4", "m4v", "avi", "mov", "webm", "mpg", "mpeg", "m2ts", "ts"};
    QDirIterator it(m_root, QDir::Files | QDir::Readable, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        it.next();
        const QFileInfo file = it.fileInfo();
        if (!extensions.contains(file.suffix().toLower())) continue;
        const QString absolute = file.canonicalFilePath();
        // Do not follow file symlinks outside the selected library.
        if (!absolute.startsWith(QFileInfo(m_root).canonicalFilePath() + "/")) continue;
        const QString relative = QDir(m_root).relativeFilePath(absolute);
        const QString id = QString::fromLatin1(QCryptographicHash::hash(relative.toUtf8(), QCryptographicHash::Sha256).toHex());
        const QString stamp = QString::number(file.size()) + ":" + QString::number(file.lastModified().toMSecsSinceEpoch());
        QSqlQuery cached(m_db);
        cached.prepare("SELECT stamp, metadata, position FROM movies WHERE id=?"); cached.addBindValue(id); cached.exec();
        QJsonObject movie;
        double position = 0;
        if (cached.next()) {
            position = cached.value(2).toDouble();
            if (cached.value(0).toString() == stamp) movie = QJsonDocument::fromJson(cached.value(1).toString().toUtf8()).object();
            else m_thumbnails.remove(id);
        }
        if (movie.isEmpty()) {
            const auto probe = QJsonDocument::fromJson(run("ffprobe", {"-v", "error", "-show_format", "-show_streams", "-of", "json", absolute}, 15000)).object();
            const double duration = probe["format"].toObject()["duration"].toString().toDouble();
            int width = 0, height = 0;
            QString codec;
            for (const auto &stream : probe["streams"].toArray()) {
                const auto s = stream.toObject();
                if (s["codec_type"] == "video") { width = s["width"].toInt(); height = s["height"].toInt(); codec = s["codec_name"].toString(); break; }
            }
            const auto match = QRegularExpression("^(.*?)[ ._\\-]((?:19|20)\\d{2})(?:[ ._\\-]|$)").match(file.completeBaseName());
            QString title = match.hasMatch() ? match.captured(1) : file.completeBaseName();
            title.replace(QRegularExpression("[._]+"), " ");
            const QString edition = file.fileName().contains("HDTS", Qt::CaseInsensitive) ? "Theater recording" : file.fileName().contains("WEBRip", Qt::CaseInsensitive) ? "Web edition" : "Original file";
            movie = {{"id", id}, {"title", title.trimmed()}, {"year", match.captured(2)}, {"filename", file.fileName()}, {"edition", edition}, {"duration", duration}, {"size", static_cast<double>(file.size())}, {"width", width}, {"height", height}, {"codec", codec}};
        }
        movie["sourcePath"] = relative;
        // Persist text only. Fallback frames are requested on demand, in memory.
        movie["image"] = QString();
        movie["hasThumbnail"] = true;
        QSqlQuery save(m_db);
        save.prepare("INSERT INTO movies(id,path,stamp,metadata,duration) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,stamp=excluded.stamp,metadata=excluded.metadata,duration=excluded.duration");
        save.addBindValue(id); save.addBindValue(absolute); save.addBindValue(stamp);
        save.addBindValue(QString::fromUtf8(QJsonDocument(movie).toJson(QJsonDocument::Compact))); save.addBindValue(movie["duration"].toDouble());
        if (!save.exec()) throw std::runtime_error(save.lastError().text().toStdString());
        movie["position"] = position;
        movies.append(enriched(movie, stamp));
        QSqlQuery lookup(m_db);
        lookup.prepare("SELECT status, checked_at, stamp FROM tmdb_metadata WHERE id=?");
        lookup.addBindValue(id); lookup.exec();
        bool fetch = true;
        if (lookup.next() && lookup.value(2).toString() == stamp) {
            const auto status = lookup.value(0).toString();
            const qint64 age = QDateTime::currentSecsSinceEpoch() - lookup.value(1).toLongLong();
            fetch = status != "matched" && age >= (status == "error" ? 300 : 7 * 86400);
        }
        if (fetch) m_tmdb->enqueue(id, stamp, file.completeBaseName(), QFileInfo(relative).dir().path() == "." ? QString() : QFileInfo(relative).dir().dirName());
    }
    m_library = {{"movies", movies}, {"path", m_root}};
    writeSnapshot();
    return m_library;
}

Library::~Library() {
    for (auto *process : findChildren<QProcess *>()) { process->disconnect(this); process->kill(); process->waitForFinished(1000); }
    const auto connection = m_db.connectionName();
    m_db.close(); m_db = QSqlDatabase();
    QSqlDatabase::removeDatabase(connection);
}

void Library::writeSnapshot() {
    QSaveFile output(m_dataDir + "/library.json");
    if (output.open(QIODevice::WriteOnly)) { output.write(QJsonDocument(m_library).toJson()); output.commit(); }
}

QJsonObject Library::enriched(QJsonObject movie, const QString &stamp) {
    QSqlQuery q(m_db);
    q.prepare("SELECT metadata,status FROM tmdb_metadata WHERE id=? AND stamp=?");
    q.addBindValue(movie["id"].toString()); q.addBindValue(stamp); q.exec();
    if (!q.next()) return movie;
    movie["metadataStatus"] = q.value(1).toString();
    const auto data = QJsonDocument::fromJson(q.value(0).toByteArray()).object();
    for (auto it = data.begin(); it != data.end(); ++it) movie[it.key()] = it.value();
    movie["image"] = data["backdropUrl"].toString().isEmpty() ? data["posterUrl"] : data["backdropUrl"];
    return movie;
}

void Library::applyMetadata(QString id, QString stamp, QJsonObject metadata, QString status) {
    QSqlQuery current(m_db);
    current.prepare("SELECT stamp,metadata,position FROM movies WHERE id=?");
    current.addBindValue(id); current.exec();
    if (!current.next() || current.value(0).toString() != stamp) return;
    QSqlQuery save(m_db);
    save.prepare("INSERT INTO tmdb_metadata(id,stamp,metadata,status,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET stamp=excluded.stamp,metadata=excluded.metadata,status=excluded.status,checked_at=excluded.checked_at");
    save.addBindValue(id); save.addBindValue(stamp); save.addBindValue(QJsonDocument(metadata).toJson(QJsonDocument::Compact));
    save.addBindValue(status); save.addBindValue(QDateTime::currentSecsSinceEpoch());
    if (!save.exec()) return;
    auto movie = enriched(QJsonDocument::fromJson(current.value(1).toByteArray()).object(), stamp);
    movie["position"] = current.value(2).toDouble();
    auto movies = m_library["movies"].toArray();
    for (int i = 0; i < movies.size(); ++i) if (movies[i].toObject()["id"] == id) movies[i] = movie;
    m_library["movies"] = movies;
    writeSnapshot();
    emit changed();
}

void Library::requestThumbnail(const QString &id) {
    if (auto *bytes = m_thumbnails.object(id)) {
        emit thumbnailReady(id, "data:image/jpeg;base64," + QString::fromLatin1(bytes->toBase64()));
        return;
    }
    if (m_thumbnailPending.contains(id)) return;
    m_thumbnailPending.insert(id);
    m_thumbnailQueue.enqueue(id);
    nextThumbnail();
}

void Library::nextThumbnail() {
    if (m_thumbnailActive || m_thumbnailQueue.isEmpty()) return;
    const auto id = m_thumbnailQueue.dequeue();
    const auto path = resolve(id);
    if (path.isEmpty()) {
        m_thumbnailPending.remove(id); emit thumbnailReady(id, {});
        QTimer::singleShot(0, this, &Library::nextThumbnail); return;
    }
    double duration = 0;
    for (const auto &movie : m_library["movies"].toArray()) if (movie.toObject()["id"] == id) duration = movie.toObject()["duration"].toDouble();
    auto *process = new QProcess(this);
    m_thumbnailActive = true;
    auto complete = [this, process, id](bool ok) {
        if (process->property("completed").toBool()) return;
        process->setProperty("completed", true);
        const auto bytes = process->readAllStandardOutput();
        const bool valid = ok && bytes.startsWith(QByteArray::fromHex("ffd8")) && bytes.size() <= 2 * 1024 * 1024;
        if (valid) m_thumbnails.insert(id, new QByteArray(bytes), bytes.size());
        emit thumbnailReady(id, valid ? "data:image/jpeg;base64," + QString::fromLatin1(bytes.toBase64()) : QString());
        process->deleteLater();
        m_thumbnailPending.remove(id); m_thumbnailActive = false;
        QTimer::singleShot(0, this, &Library::nextThumbnail);
    };
    connect(process, &QProcess::finished, this, [complete](int code, QProcess::ExitStatus status) { complete(code == 0 && status == QProcess::NormalExit); });
    connect(process, &QProcess::errorOccurred, this, [complete](QProcess::ProcessError error) { if (error == QProcess::FailedToStart) complete(false); });
    QTimer::singleShot(20000, process, [process] { process->kill(); });
    process->start("ffmpeg", {"-v", "error", "-nostdin", "-ss", QString::number(qMin(600.0, duration * 0.15)), "-i", path, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"});
}

QString Library::resolve(const QString &id) const {
    bool listed = false;
    for (const auto &movie : m_library["movies"].toArray()) if (movie.toObject()["id"] == id) listed = true;
    if (!listed) return {};
    QSqlQuery q(m_db); q.prepare("SELECT path FROM movies WHERE id=?"); q.addBindValue(id); q.exec();
    if (!q.next()) return {};
    const QString path = QFileInfo(q.value(0).toString()).canonicalFilePath();
    return path.startsWith(QFileInfo(m_root).canonicalFilePath() + "/") ? path : QString();
}
double Library::resume(const QString &id) const {
    QSqlQuery q(m_db); q.prepare("SELECT position, duration FROM movies WHERE id=?"); q.addBindValue(id); q.exec();
    if (!q.next()) return 0;
    const double p = q.value(0).toDouble(), d = q.value(1).toDouble();
    return (p > 10 && (d <= 0 || p < d - 30)) ? p : 0;
}
void Library::saveProgress(const QString &id, double position, double duration) {
    if (id.isEmpty() || duration <= 0) return;
    QSqlQuery q(m_db); q.prepare("UPDATE movies SET position=?,duration=? WHERE id=?");
    q.addBindValue(position); q.addBindValue(duration); q.addBindValue(id); q.exec();
    QJsonArray movies = m_library["movies"].toArray();
    for (int i = 0; i < movies.size(); ++i) {
        auto movie = movies[i].toObject();
        if (movie["id"] == id) { movie["position"] = position; movie["duration"] = duration; movies[i] = movie; }
    }
    m_library["movies"] = movies;
}
QJsonObject Library::snapshot() const { return m_library; }
