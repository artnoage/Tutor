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
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            this.isRecording = false;
            this.isProcessing = false;
            this.audioChunks = [];
            this.speechStartTime = null;
            this.silenceStartTime = null;
        }
    
        async playAudio(base64Audio, playbackSpeed) {
            const audioBuffer = await this.decodeAudioData(base64Audio);
            return this.playDecodedAudio(audioBuffer, playbackSpeed);
        }
    
        decodeAudioData(base64Audio) {
            return new Promise((resolve, reject) => {
                const binaryString = atob(base64Audio);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                this.audioContext.decodeAudioData(bytes.buffer, resolve, reject);
            });
        }
    
        playDecodedAudio(audioBuffer, playbackSpeed) {
            return new Promise((resolve) => {
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.playbackRate.value = playbackSpeed;
                source.connect(this.audioContext.destination);
                source.onended = resolve;
                source.start(0);
            });
        }
    
        startMonitoringInterval(callback) {
            return setInterval(() => {
                if (this.isMonitoring) {
                    const { average, isSilent } = this.monitorSound();
                    callback(average, isSilent);
                } else {
                    callback(null, null);
                }
            }, this.MONITOR_TIME_INTERVAL);
        }
    
        async trimAudioFromSpeechStart(audioBlob) {
            if (!this.speechStartTime) {
                return null; // No speech detected
            }
    
            const audioBuffer = await this.blobToAudioBuffer(audioBlob);
            const recordingStartTime = this.currentSessionTimestamp;
            const trimStartTime = Math.max(0, this.speechStartTime - recordingStartTime - 300); // 300ms buffer
            const trimStartSample = Math.floor(trimStartTime * audioBuffer.sampleRate / 1000);
    
            if (audioBuffer.length - trimStartSample < audioBuffer.sampleRate * this.MIN_VALID_DURATION) {
                return null; // Audio too short after trimming
            }
    
            const trimmedBuffer = this.audioContext.createBuffer(
                audioBuffer.numberOfChannels,
                audioBuffer.length - trimStartSample,
                audioBuffer.sampleRate
            );
    
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                trimmedBuffer.copyToChannel(channelData.slice(trimStartSample), channel);
            }
    
            return new Blob([bufferToWave(trimmedBuffer)], {type: 'audio/wav'});
        }
    
        async blobToAudioBuffer(blob) {
            const arrayBuffer = await blob.arrayBuffer();
            return new Promise((resolve, reject) => {
                this.audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });
        }
    
        async processAndSendAudio() {
            console.log('Process and send audio called');
            if (this.isProcessing) {
                console.log('Skipping audio processing: already processing');
                return;
            }
    
            this.isProcessing = true;
            const audioBlob = new Blob(this.audioChunks, {type: 'audio/wav'});
    
            try {
                const trimmedBlob = await this.trimAudioFromSpeechStart(audioBlob);
                if (trimmedBlob) {
                    await this.onRecordingComplete({ discarded: false, audioBlob: trimmedBlob });
                } else {
                    console.log('Audio discarded: no speech detected or too short');
                    await this.onRecordingComplete({ discarded: true, reason: "No speech detected or too short" });
                }
            } catch (error) {
                console.error('Error processing audio:', error);
            } finally {
                this.isProcessing = false;
                this.speechStartTime = null;
                this.silenceStartTime = null;
            }
    
            if (this.isMonitoring) {
                this.startMonitoring();
            }
        }
    }
