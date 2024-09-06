import { bufferToWave } from './audio-utils.js';

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isMonitoring = false;
        this.isRecording = false;
        this.currentSessionTimestamp = null;
        this.isProcessing = false;
        this.selectedMicrophoneId = null;
        this.pauseTime = 1;
        this.speechStartTime = null;
        this.silenceStartTime = null;
        this.onRecordingComplete = null;

        // Constants
        this.SILENCE_THRESHOLD = 24;
        this.SOUND_DETECTION_DURATION = 300;
        this.MIN_VALID_DURATION = 0.6;
        this.MONITOR_TIME_INTERVAL = 20;
    }

    start(onRecordingComplete) {
        /**
         * Starts the audio manager.
         * @param {Function} onRecordingComplete - Callback function to be called when recording is complete.
         */
        this.onRecordingComplete = onRecordingComplete;
        this.isRecording = false;
        this.isProcessing = false;
        this.currentSessionTimestamp = Date.now();
        this.startMonitoring();
    }

    async stop() {
        /**
         * Stops the audio manager and cleans up resources.
         */
        this.currentSessionTimestamp = null;
        this.isRecording = false;
        this.isProcessing = false;
        if (this.isRecording) {
            await this.stopRecording();
        }
        this.stopTutor();
        this.audioChunks = [];
        this.speechStartTime = null;
        this.silenceStartTime = null;
    }

    startMonitoring() {
        /**
         * Starts monitoring audio input.
         */
        console.log('startMonitoring called');
        this.speechStartTime = null;
        this.silenceStartTime = null;
        
        const constraints = {
            audio: {
                deviceId: this.selectedMicrophoneId ? {exact: this.selectedMicrophoneId} : undefined
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                this.stream = stream;
                this.setupAudioContext();
                this.startMonitoringInternal();
                this.startRecording();
            })
            .catch(err => {
                console.error("Error accessing microphone:", err);
                throw err;
            });
    }

    setMicrophone(deviceId) {
        /**
         * Sets the microphone to use for audio input.
         * @param {string} deviceId - The ID of the microphone device.
         */
        this.selectedMicrophoneId = deviceId;
    }

    setPauseTime(time) {
        /**
         * Sets the pause time between recordings.
         * @param {number} time - The pause time in seconds.
         */
        this.pauseTime = time;
    }

    async manualStop() {
        /**
         * Manually stops the current recording session.
         */
        console.log('Manual stop called');
        this.isRecording = false;
        await this.stopRecording();
        this.stopMonitoringInternal();
        
        setTimeout(() => {
            this.processAndSendAudio();
        }, this.pauseTime * 900);
    }

    setupAudioContext() {
        /**
         * Sets up the audio context and analyser for processing audio.
         */
        console.log('Setting up audio context');
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.analyser);

        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
    }

    startMonitoringInternal() {
        /**
         * Internal method to start the monitoring process.
         */
        console.log('Start monitoring function called');
        this.isMonitoring = true;
        this.monitorSound();
    }

    monitorSound() {
        /**
         * Monitors the sound level and determines if it's silent.
         * @returns {Object} An object containing the average sound level and whether it's silent.
         */
        if (!this.isMonitoring || !this.analyser || !this.dataArray) {
            return { average: 0, isSilent: true };
        }

        this.analyser.getByteFrequencyData(this.dataArray);

        const average = this.dataArray.reduce((acc, value) => acc + value, 0) / this.dataArray.length;
        const isSilent = average < this.SILENCE_THRESHOLD;

        this.handleSoundState(isSilent);

        return { average, isSilent };
    }

    handleSoundState(isSilent) {
        /**
         * Handles the current sound state (silent or not).
         * @param {boolean} isSilent - Whether the current audio is silent.
         */
        const currentTime = Date.now();

        if (!isSilent) {
            if (!this.speechStartTime) {
                this.speechStartTime = currentTime;
            }
            this.silenceStartTime = null;
        } else {
            if (this.speechStartTime) {
                if (!this.silenceStartTime) {
                    this.silenceStartTime = currentTime;
                } else if (currentTime - this.silenceStartTime >= this.pauseTime * 1000) {
                    this.stopRecording().then(result => {
                        this.onRecordingComplete(result);
                    });
                }
            }
        }
    }

    startRecording() {
        /**
         * Starts recording audio.
         */
        console.log('Start recording function called');
        this.isRecording = true;
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);
        this.mediaRecorder.ondataavailable = event => {
            this.audioChunks.push(event.data);
        };
        this.mediaRecorder.start();
        this.speechStartTime = null;
        this.silenceStartTime = null;
    }

    async stopRecording() {
        /**
         * Stops the current recording session.
         * @returns {Promise<Object>} A promise that resolves with the recording result.
         */
        console.log('Stop recording function called');
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.stopMonitoringInternal();
            
            return new Promise((resolve) => {
                this.mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(this.audioChunks, {type: 'audio/wav'});
                    resolve({ discarded: false, audioBlob: audioBlob });
                };
            });
        }
        return Promise.resolve({ discarded: true, reason: "No active recording" });
    }

    stopMonitoringInternal() {
        /**
         * Internal method to stop the monitoring process.
         */
        console.log('Stop monitoring function called');
        this.isMonitoring = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }

    stopTutor() {
        /**
         * Stops all tutor-related processes and cleans up resources.
         */
        console.log('Stop tutor function called');
        this.stopMonitoringInternal();
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.audioContext)
