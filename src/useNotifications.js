// src/useNotifications.js

export const defaultNotifSettings = {
  enabled: false,
  morning: { enabled: true,  time: "08:00", message: "Good morning ✨ Time to start your wellness day!" },
  water:   { enabled: true,  time: "10:00", message: "💧 Have you had your water today? Stay hydrated, glow from within." },
  lunch:   { enabled: true,  time: "13:00", message: "🌿 Midday check-in — how's your day going? Log your steps!" },
  evening: { enabled: true,  time: "19:00", message: "🌸 Evening reminder — don't forget your self care ritual tonight." },
  night:   { enabled: true,  time: "22:00", message: "🌙 Almost bedtime — log your day and let your blob know how you did!" },
  workout: { enabled: false, time: "17:00", message: "💪 It's workout time! Even a walk counts — let's move." },
};

export async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function getPermissionStatus() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function sendTestNotification() {
  if (Notification.permission !== "granted") return;
  new Notification("Wellness ✨", {
    body: "Notifications are working! Your blob is happy 🌿",
    icon: "/icon-192.png",
  });
}

let scheduledTimeouts = [];

export function scheduleNotifications(settings) {
  scheduledTimeouts.forEach(id => clearTimeout(id));
  scheduledTimeouts = [];
  if (!settings.enabled || Notification.permission !== "granted") return;
  const now = new Date();
  Object.entries(settings).forEach(([key, val]) => {
    if (key === "enabled" || !val?.enabled || !val.time) return;
    const [h, m] = val.time.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    const delay = target - now;
    if (delay <= 0) return;
    const id = setTimeout(() => {
      new Notification("Wellness ✨", {
        body: val.message, icon: "/icon-192.png", tag: key,
      });
    }, delay);
    scheduledTimeouts.push(id);
  });
}
