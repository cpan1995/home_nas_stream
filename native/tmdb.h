#pragma once
#include <QObject>
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QQueue>
#include <QSet>
#include <QUrlQuery>
#include <functional>

struct MovieQuery { QString title, year; };

class TmdbClient : public QObject {
    Q_OBJECT
public:
    explicit TmdbClient(QString token, QObject *parent = nullptr);
    bool enabled() const { return !m_token.isEmpty(); }
    bool busy() const { return m_active || !m_queue.isEmpty(); }
    void enqueue(QString id, QString stamp, QString filename, QString parentFolder);
    static MovieQuery parseName(QString name);
    static int chooseMatch(const QJsonArray &results, const MovieQuery &query);
    static QString imageUrl(const QString &path, const QString &size);
signals:
    void resolved(QString id, QString stamp, QJsonObject metadata, QString status);
    void idle();
protected:
    using Done = std::function<void(QJsonObject, bool)>;
    virtual void request(const QString &path, const QUrlQuery &query, Done done);
private:
    struct Job { QString id, stamp; QList<MovieQuery> queries; };
    void next();
    void search(int index);
    void finish(const QJsonObject &metadata, const QString &status);
    QString m_token;
    QNetworkAccessManager m_network;
    QQueue<Job> m_queue;
    QSet<QString> m_pending;
    Job m_job;
    bool m_active = false;
};
