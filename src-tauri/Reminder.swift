import Foundation
import UserNotifications

@_cdecl("pingboard_reminder")
public func reminder(_ rawID: UnsafePointer<CChar>, _ rawTitle: UnsafePointer<CChar>, _ epoch: Double, _ token: UInt64, _ done: @escaping @convention(c) (UInt64, Int32) -> Void) {
    let id = String(cString: rawID)
    let title = String(cString: rawTitle)
    let center = UNUserNotificationCenter.current()
    guard epoch > Date().timeIntervalSince1970 else {
        center.removePendingNotificationRequests(withIdentifiers: [id])
        done(token, 0)
        return
    }
    center.requestAuthorization(options: [.alert, .sound]) { allowed, _ in
        guard allowed else { done(token, 1); return }
        let content = UNMutableNotificationContent()
        content.title = "Пингборд"
        content.body = title
        content.sound = .default
        let date = Date(timeIntervalSince1970: epoch)
        let parts = Calendar.current.dateComponents([.year,.month,.day,.hour,.minute,.second], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in done(token, error == nil ? 0 : 2) }
    }
}
