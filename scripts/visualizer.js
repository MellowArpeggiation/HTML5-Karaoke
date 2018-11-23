/**
 * An audio spectrum visualizer built with HTML5 Audio API
 * Author: Wayou, George Paton
 * License: MIT
 * 23rd November 2018
 */

(function () {

    /**
     * @class Visualizer
     */
    var Visualizer = function () {
        this.infoBar = document.querySelector('#info');
        this.audioInput = document.querySelector('#uploaded-file');
        this.canvas = document.querySelector('canvas');
        this.fileWrapper = document.querySelector('#file-wrapper');

        this.file = null; // The current file
        this.fileName = null; // The current file name
        this.audioContext = null;
        this.source = null; // The audio source
        this.info = this.infoBar.innerHTML; // Used to upgrade the UI information
        this.infoUpdateId = null; // To store the setTimeout ID and clear the interval
        this.animationId = null;
        this.isPlaying = false;
        this.forceStop = false;
        this.allCapsReachBottom = false;

        this.init();
    };

    Visualizer.prototype = {

        init: function () {
            this._prepareAPI();
            this._addEventListner();
        },

        _prepareAPI: function () {
            //fix browser vender for AudioContext and requestAnimationFrame
            window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;
            window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
            window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || window.msCancelAnimationFrame;

            try {
                this.audioContext = new AudioContext();
            } catch (event) {
                this._updateInfo('!Your browser does not support AudioContext', false);
                console.log(event);
            }
        },

        _addEventListner: function () {
            // Detect an audio file upload
            this.audioInput.onchange = () => {
                if (this.audioContext === null) return;
    
                // The if statement fixes the file selection cancel, because the onchange will trigger even the file selection been cancelled
                if (this.audioInput.files.length !== 0) {
                    // Only process the first file
                    this.file = this.audioInput.files[0];
                    this.fileName = this.file.name;

                    if (this.isPlaying) {
                        // The sound is still playing but we upload another file, so set the forceStop flag to true
                        this.forceStop = true;
                    }

                    this.fileWrapper.style.opacity = 1;

                    this._updateInfo('Uploading', true);

                    // Once the file is ready, start the visualizer
                    this._start();
                }
            };

            // Listen the drag & drop
            this.canvas.addEventListener("dragenter", () => {
                this.fileWrapper.style.opacity = 1;
                this._updateInfo('Drop it on the page', true);
            }, false);

            this.canvas.addEventListener("dragover", (event) => {
                event.stopPropagation();
                event.preventDefault();

                // Set the drop mode
                event.dataTransfer.dropEffect = 'copy';
            }, false);

            this.canvas.addEventListener("dragleave", () => {
                this.fileWrapper.style.opacity = 0.2;
                this._updateInfo(this.info, false);
            }, false);

            this.canvas.addEventListener("drop", (event) => {
                event.stopPropagation();
                event.preventDefault();
                
                if (this.audioContext === null) return;

                this.fileWrapper.style.opacity = 1;
                this._updateInfo('Uploading', true);

                // Get the dropped file
                this.file = event.dataTransfer.files[0];
                if (this.isPlaying) {
                    this.fileWrapper.style.opacity = 1;
                    this.forceStop = true;
                }

                this.fileName = this.file.name;

                // Once the file is ready, start the visualizer
                this._start();
            }, false);
        },

        _start: function () {
            // Read and decode the file into audio array buffer
            var file = this.file;
            var fr = new FileReader();

            fr.onload = (event) => {
                var fileResult = event.target.result;
                var audioContext = this.audioContext;

                if (audioContext === null) return;

                this._updateInfo('Decoding the audio', true);
                audioContext.decodeAudioData(fileResult, (buffer) => {
                    this._updateInfo('Decode succussfully,start the visualizer', true);
                    this._visualize(audioContext, buffer);
                }, (event) => {
                    this._updateInfo('!Fail to decode the file', false);
                    console.error(event);
                });
            };

            fr.onerror = (event) => {
                this._updateInfo('!Fail to read the file', false);
                console.error(event);
            };

            // Assign the file to the reader
            this._updateInfo('Starting read the file', true);
            fr.readAsArrayBuffer(file);
        },

        _visualize: function (audioContext, buffer) {
            var audioBufferSouceNode = audioContext.createBufferSource();
            var analyser = audioContext.createAnalyser();

            // Connect the source to the analyser
            audioBufferSouceNode.connect(analyser);

            // Connect the analyser to the destination(the speaker), or we won't hear the sound
            analyser.connect(audioContext.destination);

            // Then assign the buffer to the buffer source node
            audioBufferSouceNode.buffer = buffer;

            // Play the source
            if (!audioBufferSouceNode.start) {
                // Support for older browsers
                audioBufferSouceNode.start = audioBufferSouceNode.noteOn;
                audioBufferSouceNode.stop = audioBufferSouceNode.noteOff;
            }

            // Stop the previous sound if any
            if (this.animationId !== null) {
                cancelAnimationFrame(this.animationId);
            }

            if (this.source !== null) {
                this.source.stop(0);
            }

            audioBufferSouceNode.start(0);
            this.isPlaying = true;
            this.source = audioBufferSouceNode;

            audioBufferSouceNode.onended = () => {
                this._audioEnd();
            };

            this._updateInfo('Playing ' + this.fileName, false);
            this.info = 'Playing ' + this.fileName;
            this.fileWrapper.style.opacity = 0.2;
            this._drawSpectrum(analyser);
        },

        _drawSpectrum: function (analyser) {
            var cwidth = this.canvas.width;
            var cheight = this.canvas.height - 2;
            var meterWidth = 10; // Width of the meters in the spectrum
            var capHeight = 2;
            var capStyle = '#fff';
            var meterNum = 800 / (10 + 2); // Count of the meters
            var capYPositionArray = []; // Store the vertical position of the caps for the previous frame

            var ctx = this.canvas.getContext('2d');
            var gradient = ctx.createLinearGradient(0, 0, 0, 300);

            gradient.addColorStop(1, '#0f0');
            gradient.addColorStop(0.5, '#ff0');
            gradient.addColorStop(0, '#f00');

            var drawMeter = () => {
                var array = new Uint8Array(analyser.frequencyBinCount);
                var i;

                analyser.getByteFrequencyData(array);

                if (!this.isPlaying) {
                    // Fix when some sounds end the value still not back to zero
                    for (i = array.length - 1; i >= 0; i--) {
                        array[i] = 0;
                    }

                    var allCapsReachBottom = true;
                    for (i = capYPositionArray.length - 1; i >= 0; i--) {
                        allCapsReachBottom = allCapsReachBottom && (capYPositionArray[i] === 0);
                    }

                    if (allCapsReachBottom) {
                        // Since the sound is stopped and animation finished, stop the requestAnimation
                        cancelAnimationFrame(this.animationId);
                        return;
                    }
                }

                var step = Math.round(array.length / meterNum); // Sample limited data from the total array
                ctx.clearRect(0, 0, cwidth, cheight);

                for (i = 0; i < meterNum; i++) {
                    var value = array[i * step];

                    if (capYPositionArray.length < Math.round(meterNum)) {
                        capYPositionArray.push(value);
                    }

                    ctx.fillStyle = capStyle;

                    // Draw the cap, with transition effect
                    if (value < capYPositionArray[i]) {
                        ctx.fillRect(i * 12, cheight - (--capYPositionArray[i]), meterWidth, capHeight);
                    } else {
                        ctx.fillRect(i * 12, cheight - value, meterWidth, capHeight);
                        capYPositionArray[i] = value;
                    }

                    ctx.fillStyle = gradient; // Set the fillStyle to gradient for a better look
                    ctx.fillRect(i * 12, cheight - value + capHeight, meterWidth, cheight);
                }

                this.animationId = requestAnimationFrame(drawMeter);
            };

            this.animationId = requestAnimationFrame(drawMeter);
        },

        _audioEnd: function () {
            if (this.forceStop) {
                this.forceStop = false;
                this.isPlaying = true;
                return;
            }

            this.isPlaying = false;

            var text = 'HTML5 Audio API showcase | An Audio Viusalizer';
            this.infoBar.innerHTML = text;
            this.info = text;

            this.fileWrapper.style.opacity = 1;
            this.audioInput.value = '';
        },

        _updateInfo: function (text, processing) {
            var dots = '...';
            var i = 0;
            
            this.infoBar.innerHTML = text + dots.substring(0, i++);

            if (this.infoUpdateId !== null) {
                clearTimeout(this.infoUpdateId);
            }

            if (processing) {
                // Animate dots at the end of the info text
                var animateDot = () => {
                    if (i > 3) {
                        i = 0;
                    }

                    this.infoBar.innerHTML = text + dots.substring(0, i++);
                    this.infoUpdateId = setTimeout(animateDot, 250);
                };

                this.infoUpdateId = setTimeout(animateDot, 250);
            }
        },

    };

    // Export to global
    window.Visualizer = Visualizer;

})();
