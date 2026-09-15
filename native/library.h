#pragma once
#include <QJsonObject>
#include <QSqlDatabase>
#include <QString>
#include <QObject>
#include <QCache>
#include <QQueue>
#include <QSet>
#include "tmdb.h"

class Library : public QObject {
    Q_OBJECT
public:
    Library(QString root, QString dataDir, bool online = true, TmdbClient *client = nullptr);
    ~Library() override;
    QJsonObject scan();
    QString resolve(const QString &id) const;
    double resume(const QString &id) const;
    void saveProgress(const QString &id, double position, double duration);
    QJsonObject snapshot() const;
    bool metadataBusy() const { return m_tmdb->busy(); }
    void requestThumbnail(const QString &id);
signals:
    void changed();
    void metadataIdle();
    void thumbnailReady(QString id, QString image);
private:
    void writeSnapshot();
    void applyMetadata(QString id, QString stamp, QJsonObject metadata, QString status);
    QJsonObject enriched(QJsonObject movie, const QString &stamp);
    void nextThumbnail();
    QString m_root, m_dataDir;
    QSqlDatabase m_db;
    QJsonObject m_library;
    TmdbClient *m_tmdb;
    QCache<QString, QByteArray> m_thumbnails{16 * 1024 * 1024};
    QQueue<QString> m_thumbnailQueue;
    QSet<QString> m_thumbnailPending;
    bool m_thumbnailActive = false;
};
