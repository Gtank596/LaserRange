// Asks the device not to dim or lock the screen while a session runs. A locked
// phone stops the camera, which ends the session.
//
// UNVERIFIED ASSUMPTION: that this works on the iPhone, in Safari and as a
// home-screen app. Older iOS versions lacked it or ignored it in home-screen
// apps. The session screen shows whether the request was granted.

/**
 * @returns {Promise<{ active: boolean, release: () => void }>} active is false
 *   when the browser has no such feature or refused (for example, low power mode)
 */
export async function keepAwake() {
  try {
    if (!('wakeLock' in navigator)) return { active: false, release() {} };
    const sentinel = await navigator.wakeLock.request('screen');
    return {
      active: true,
      release() {
        sentinel.release().catch(() => {});
      },
    };
  } catch {
    return { active: false, release() {} };
  }
}
