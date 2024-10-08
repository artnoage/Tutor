import { AudioManager } from './audio-manager.js';
import { sendAudioToServer, generateChatName } from './api-service.js';

const dbName = "TutorChatDB";
const objectStoreName = "chatObjects";

class TutorController {
    constructor() {
        this.isActive = false;
        this.formElements = null;
        this.uiCallbacks = null;
        this.chatObjects = [];
        this.currentChatTimestamp = null;
        this.pauseTime = 1;
        this.disableTutor = false;
        this.accentIgnore = true;
        this.pendingProcessingPromise = null;
        this.audioManager = new AudioManager();
        this.dbPromise = this.initDatabase();
        this.isInitialized = false;
    }

    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(objectStoreName)) {
                    db.createObjectStore(objectStoreName, { keyPath: "timestamp" });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.loadChatObjects().then(() => {
                    this.isInitialized = true;
                    if (this.uiCallbacks && this.uiCallbacks.onInitialLoadComplete) {
                        this.uiCallbacks.onInitialLoadComplete();
                    }
                });
                resolve();
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    async saveChatObjects() {
        await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], "readwrite");
            const store = transaction.objectStore(objectStoreName);

            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                this.chatObjects.forEach((chatObject) => {
                    store.add(chatObject);
                });
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    async loadChatObjects() {
        await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], "readonly");
            const store = transaction.objectStore(objectStoreName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                const loadedChatObjects = event.target.result;
                if (loadedChatObjects.length > 0) {
                    this.chatObjects = loadedChatObjects;
                    this.currentChatTimestamp = this.chatObjects[this.chatObjects.length - 1].timestamp;
                }
                if (this.uiCallbacks && this.uiCallbacks.onChatObjectsLoaded) {
                    this.uiCallbacks.onChatObjectsLoaded();
                }
                resolve(this.chatObjects);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    setFormElements(elements) {
        this.formElements = elements;
    }

    setUICallbacks(callbacks) {
        this.uiCallbacks = callbacks;
    }

    async createNewChat(modelSelect, tutoringLanguageSelect) {
        if (!this.isInitialized) {
            await this.dbPromise;
        }

        const newChatTemplate = {
            chat_history: [],
            tutors_comments: [],
            summary: [],
            timestamp: Date.now(),
            name: ''
        };

        if (this.chatObjects.length > 0) {
            this.chatObjects.sort((a, b) => b.timestamp - a.timestamp);
            const lastChat = this.chatObjects[0];
            const isEmptyChat = lastChat.chat_history.length === 0 && lastChat.tutors_comments.length === 0;

            if (isEmptyChat) {
                if (this.uiCallbacks.onInfoUpdate) {
                    this.uiCallbacks.onInfoUpdate("The last chat is empty. Please use it instead of creating a new one.");
                }
                return null;
            }

            const lastSummary = lastChat.summary[lastChat.summary.length - 1];
            const isEmptySummary = !lastSummary || lastSummary.trim() === '';

            if (isEmptySummary) {
                lastChat.name = "Empty Chat";
            } else {
                try {
                    const formElementsForChatName = {
                        chatObject: lastChat,
                        modelSelect: { value: modelSelect.value },
                        tutoringLanguageSelect: { value: tutoringLanguageSelect.value }
                    };
                    lastChat.name = await generateChatName(formElementsForChatName);
                } catch (error) {
                    console.error('Error generating chat name:', error);
                    lastChat.name = `Chat ${new Date(lastChat.timestamp).toLocaleString()}`;
                }
            }
            await this.saveChatObjects();
        }

        const newChat = { ...newChatTemplate };
        this.chatObjects.push(newChat);
        this.currentChatTimestamp = newChat.timestamp;
        await this.saveChatObjects();
        
        if (this.uiCallbacks.onChatCreated) {
            this.uiCallbacks.onChatCreated(newChat.timestamp);
        }
        return newChat;
    }

    async start() {
        this.isActive = true;
        await this.dbPromise;
        if (this.chatObjects.length === 0) {
            await this.createNewChat(this.formElements.modelSelect, this.formElements.tutoringLanguageSelect);
        }
        this.audioManager.start(this.onRecordingComplete.bind(this));
    }

    async stop() {
        this.isActive = false;
        await this.audioManager.stop();
        
        if (this.pendingProcessingPromise) {
            this.pendingProcessingPromise.cancel();
            this.pendingProcessingPromise = null;
        }
    }

    switchChat(timestamp) {
        const chat = this.chatObjects.find(chat => chat.timestamp === timestamp);
        if (chat) {
            this.currentChatTimestamp = timestamp;
            this.chatObjects.sort((a, b) => b.timestamp - a.timestamp);
            if (this.uiCallbacks.onChatSwitched) {
                this.uiCallbacks.onChatSwitched(chat);
            }
            // Clear homework chat display
            if (this.uiCallbacks.onHomeworkChatCleared) {
                this.uiCallbacks.onHomeworkChatCleared();
            }
        }
    }

    getCurrentChat() {
        return this.chatObjects.find(chat => chat.timestamp === this.currentChatTimestamp) || null;
    }

    setMicrophone(deviceId) {
        this.audioManager.setMicrophone(deviceId);
    }

    setPauseTime(time) {
        this.pauseTime = time;
        this.audioManager.setPauseTime(time);
    }

    setDisableTutor(disable) {
        this.disableTutor = disable;
    }

    setAccentIgnore(ignore) {
        this.accentIgnore = ignore;
    }

    setTutoringLanguage(language) {
        this.tutoringLanguage = language;
    }

    updateTutorsVoice(voice) {
        this.tutorsVoice = voice;
    }

    updatePartnersVoice(voice) {
        this.partnersVoice = voice;
    }

    updateInterventionLevel(level) {
        this.interventionLevel = level;
    }

    updateModel(model) {
        this.model = model;
    }

    async manualStop() {
        await this.audioManager.manualStop();
        if (this.uiCallbacks.onProcessingStart) {
            this.uiCallbacks.onProcessingStart();
        }
    }

    async processAndPlayAudio(audioData) {
        try {
            if (this.uiCallbacks.onProcessingStart) {
                this.uiCallbacks.onProcessingStart();
            }

            const currentChat = this.getCurrentChat();
            if (!currentChat) {
                throw new Error('No current chat found');
            }

            const formElementsWithChat = {
                ...this.formElements,
                chatObject: {
                    chat_history: currentChat.chat_history || [],
                    tutors_comments: currentChat.tutors_comments || [],
                    summary: currentChat.summary || [],
                    timestamp: currentChat.timestamp
                }
            };

            const result = await sendAudioToServer(audioData, formElementsWithChat);

            if (result.chatObject) {
                const index = this.chatObjects.findIndex(chat => chat.timestamp === this.currentChatTimestamp);
                if (index !== -1) {
                    this.chatObjects[index] = {
                        ...result.chatObject,
                        timestamp: this.currentChatTimestamp
                    };
                    await this.saveChatObjects();
                }
                
                if (this.uiCallbacks.onAPIResponseReceived) {
                    this.uiCallbacks.onAPIResponseReceived(result.chatObject);
                }
            }
            
            if (result.audio_base64) {
                if (this.uiCallbacks.onAudioPlayStart) {
                    this.uiCallbacks.onAudioPlayStart();
                }
                const playbackSpeed = 0.9 + (parseFloat(this.formElements.playbackSpeedSlider.value) * 0.1);
                await this.audioManager.playAudio(result.audio_base64, playbackSpeed);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error processing or playing audio:', error);
            if (this.uiCallbacks.onError) {
                this.uiCallbacks.onError("Error processing or playing audio: " + error.message);
            }
            return { success: false, error: error.message };
        }
    }

    async onRecordingComplete(result) {
        if (result.discarded) {
            if (this.uiCallbacks.onRecordingDiscarded) {
                this.uiCallbacks.onRecordingDiscarded(result.reason);
            }
            this.audioManager.startMonitoring();
        } else {
            const processResult = await this.processAndPlayAudio(result.audioBlob);
            
            if (processResult.success && this.isActive) {
                this.audioManager.startMonitoring();
            }
        }
    }

    startMonitoringInterval() {
        return this.audioManager.startMonitoringInterval((average, isSilent) => {
            if (this.uiCallbacks.onSoundLevelUpdate) {
                this.uiCallbacks.onSoundLevelUpdate(average, isSilent);
            }
        });
    }
}

export const tutorController = new TutorController();
