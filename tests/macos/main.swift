import Foundation
import UserNotifications

let center = UNUserNotificationCenter.current()
let id = "pingboard-integration"
let mode = CommandLine.arguments[1]
func result(_ ok: Bool) { exit(ok ? 0 : 1) }
switch mode {
case "schedule", "move", "cancel":
    let delay = mode == "schedule" ? 5.0 : 18.0
    let when = mode == "cancel" ? 0 : Date().timeIntervalSince1970 + delay
    reminder(id, mode, when, 0) { _, status in
        if status != 0 { print("Notification request returned status \(status)") }
        result(status == 0)
    }
case "pending", "empty":
    center.getPendingNotificationRequests { requests in
        result(requests.filter { $0.identifier == id }.count == (mode == "empty" ? 0 : 1))
    }
case "silent":
    center.getDeliveredNotifications { notes in result(!notes.contains { $0.request.identifier == id }) }
case "delivered":
    center.getDeliveredNotifications { notes in
        result(notes.contains { $0.request.identifier == id && $0.request.content.body == "move" })
    }
case "clean":
    center.removeDeliveredNotifications(withIdentifiers: [id])
    center.removePendingNotificationRequests(withIdentifiers: [id])
    exit(0)
default: exit(2)
}
RunLoop.main.run()
