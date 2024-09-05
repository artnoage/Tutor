const SETTINGS_KEY = 'tutorSettings';
const VERSION_KEY = 'tutorVersion';
const CURRENT_VERSION = '1.0.0'; // Update this when you release a new version

export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
}

export function loadSettings() {
    const savedVersion = localStorage.getItem(VERSION_KEY);
    if (savedVersion !== CURRENT_VERSION) {
        // Clear settings and return null if versions don't match
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        return null;
    }
    const settingsJson = localStorage.getItem(SETTINGS_KEY);
    return settingsJson ? JSON.parse(settingsJson) : null;
}

export function clearAllData() {
    return new Promise((resolve, reject) => {
        // Clear localStorage
        localStorage.clear();

        // Clear IndexedDB
        const request = indexedDB.deleteDatabase("TutorChatDB");
        request.onsuccess = () => {
            console.log("IndexedDB TutorChatDB deleted successfully");
            resolve();
        };
        request.onerror = () => {
            console.error("Error deleting IndexedDB TutorChatDB");
            reject();
        };
    });
}

export function checkAndUpdateVersion() {
    const savedVersion = localStorage.getItem(VERSION_KEY);
    if (savedVersion !== CURRENT_VERSION) {
        return clearAllData().then(() => {
            localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
            console.log("Data cleared and version updated");
            return true; // Indicates that a version change occurred
        });
    }
    return Promise.resolve(false); // No version change
}
