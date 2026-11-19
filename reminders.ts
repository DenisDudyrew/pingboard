type ReminderTask = {id: string, title: string, due: string, stage: number}

export function reminderChanges(previous: ReminderTask[], next: ReminderTask[]) {
  const before = new Map(previous.map(task => [task.id, task]))
  const changes = []
  for (const task of next) {
    const old = before.get(task.id)
    before.delete(task.id)
    const active = task.stage !== 2 && Boolean(task.due)
    const wasActive = old && old.stage !== 2 && Boolean(old.due)
    if (active && (!wasActive || old.due !== task.due || old.title !== task.title)) {
      changes.push({id: task.id, title: task.title, epoch: Date.parse(task.due) / 1000})
    } else if (!active && wasActive) {
      changes.push({id: task.id, title: task.title, epoch: 0})
    }
  }
  for (const task of before.values()) {
    if (task.stage !== 2 && task.due) changes.push({id: task.id, title: task.title, epoch: 0})
  }
  return changes
}
