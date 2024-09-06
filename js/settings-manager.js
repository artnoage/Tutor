const CURRENT_VERSION = '1.0.2';
import { API_URL } from './api-service.js';

class SettingsManager {
    constructor() {
        this.settings = {};
        this.loadSettings();
    }

    loadSettings() {
        /**
         * Loads settings from local storage.
         * If settings are not found or version mismatch, resets to defaults.
         */
        const savedSettings = localStorage.getItem('tutorSettings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            if (parsedSettings.version === CURRENT_VERSION) {
                this.settings = parsedSettings;
            } else {
                // Version mismatch, use default settings
                this.resetToDefaults();
            }
        } else {
            this.resetToDefaults();
        }
    }

    saveSettings() {
        /**
         * Saves current settings to local storage.
         */
        this.settings.version = CURRENT_VERSION;
        localStorage.setItem('tutorSettings', JSON.stringify(this.settings));
    }

    resetToDefaults() {
        /**
         * Resets settings to default values.
         */
        this.settings = {
            tutoringLanguage: 'English',
            tutorsLanguage: 'English',
            tutorsVoice: 'alloy',
            partnersVoice: 'nova',
            interventionLevel: 'medium',
            playbackSpeed: 1,
            pauseTime: 2,
            disableTutor: false,
            accentIgnore: true,
            model: 'Groq',
            grogApiKey: '',
            openaiApiKey: '',
            anthropicApiKey: '',
            version: CURRENT_VERSION
        };
        this.saveSettings();
    }

    updateSetting(key, value) {
        /**
         * Updates a single setting.
         * @param {string} key - The setting key to update.
         * @param {*} value - The new value for the setting.
         */
        if (key in this.settings) {
            this.settings[key] = value;
            this.saveSettings();
        } else {
            console.warn(`Attempted to update non-existent setting: ${key}`);
        }
    }

    async verifyApiKey(apiKey, model) {
        /**
         * Verifies an API key with the server.
         * @param {string} apiKey - The API key to verify.
         * @param {string} model - The model associated with the API key.
         * @returns {Promise<boolean>} Whether the API key is valid.
         */
        const formData = new FormData();
        formData.append('api_key', apiKey);
        formData.append('model', model);

        try {
            const response = await fetch(`${API_URL}/verify_api_key`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            return result.valid;
        } catch (error) {
            console.error('Error verifying API key:', error);
            return false;
        }
    }

    async updateSetting(key, value) {
        /**
         * Updates a setting, with special handling for API keys.
         * @param {string} key - The setting key to update.
         * @param {*} value - The new value for the setting.
         * @returns {Promise<boolean>} Whether the update was successful.
         * @throws {Error} If the API key is invalid.
         */
        if (key.endsWith('ApiKey')) {
            const model = key.replace('ApiKey', '');
            const isValid = await this.verifyApiKey(value, model);
            if (!isValid) {
                throw new Error('Invalid API key. Please try again with a valid key.');
            }
        }
        this.settings[key] = value;
        this.saveSettings();
        return true; // Indicate successful update
    }

    getSetting(key) {
        /**
         * Retrieves the value of a setting.
         * @param {string} key - The key of the setting to retrieve.
         * @returns {*} The value of the setting.
         */
        return this.settings[key];
    }
}

export const settingsManager = new SettingsManager();
