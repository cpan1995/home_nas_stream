#pragma once
#include <QCursor>
#include <QGuiApplication>
#include <QMouseEvent>
#include <QObject>
#include <QTimer>
#include <QWindow>

// A native override also covers WebEngine's cursor over embedded video frames.
class IdleCursor final : public QObject {
public:
    explicit IdleCursor(QWindow *window) : QObject(window), m_window(window) {
        m_timer.setSingleShot(true);
        m_timer.setInterval(3000);
        connect(&m_timer, &QTimer::timeout, this, [this] {
            if (!m_window->isActive() || m_hidden || QGuiApplication::overrideCursor()) return;
            QGuiApplication::setOverrideCursor(QCursor(Qt::BlankCursor));
            m_hidden = true;
        });
        connect(window, &QWindow::activeChanged, this, [this] {
            reveal();
            if (m_window->isActive()) m_timer.start();
            else m_timer.stop();
        });
        qGuiApp->installEventFilter(this);
        m_timer.start();
    }
    ~IdleCursor() override { reveal(); }

protected:
    bool eventFilter(QObject *, QEvent *event) override {
        if (!m_window->isActive()) return false;
        if (event->type() == QEvent::MouseMove) {
            const auto position = static_cast<QMouseEvent *>(event)->globalPosition();
            // Cursor/hover updates can repeat the last coordinates without movement.
            if (m_havePosition && position == m_position) return false;
            m_position = position;
            m_havePosition = true;
        } else if (event->type() != QEvent::MouseButtonPress &&
                   event->type() != QEvent::MouseButtonDblClick &&
                   event->type() != QEvent::Wheel) {
            return false;
        }
        reveal();
        m_timer.start();
        return false; // Pointer input must still reach the player/browser.
    }

private:
    void reveal() {
        if (!m_hidden) return;
        QGuiApplication::restoreOverrideCursor();
        m_hidden = false;
    }
    QWindow *m_window;
    QTimer m_timer;
    QPointF m_position;
    bool m_havePosition = false;
    bool m_hidden = false;
};
