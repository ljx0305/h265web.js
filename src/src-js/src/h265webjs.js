/********************************************************* 
 * LICENSE: LICENSE-Free_CN.MD
 * 
 * Author: Numberwolf - ChangYanlong
 * QQ: 531365872
 * QQ Group:925466059
 * Wechat: numberwolf11
 * Discord: numberwolf#8694
 * E-Mail: porschegt23@foxmail.com
 * Github: https://github.com/numberwolf/h265web.js
 * 
 * 作者: 小老虎(Numberwolf)(常炎隆)
 * QQ: 531365872
 * QQ群: 531365872
 * 微信: numberwolf11
 * Discord: numberwolf#8694
 * 邮箱: porschegt23@foxmail.com
 * 博客: https://www.jianshu.com/u/9c09c1e00fd1
 * Github: https://github.com/numberwolf/h265web.js
 * 
 **********************************************************/
const Player = require('./decoder/player-core');
const PlayerNative = require('./native/mp4-player');
const CNativeCore = require('./decoder/c-native-core');
const CHttpLiveCore = require('./decoder/c-httplive-core');
const CHttpG711Core = require('./decoder/c-http-g711-core');
const CWsLiveCore = require('./decoder/c-wslive-core');
const NvVideoJSCore = require('./native/nv-videojs-core');
const NvFlvJSCore = require('./native/nv-flvjs-core');
const NvMpegTsCore = require('./native/nv-mpegts-core');
const AVCOMMON = require('./decoder/av-common');
const MPEG_JS = require('./demuxer/mpegts/mpeg.js');
const Mp4Parser = require('./demuxer/mp4');
const MpegTSParser = require('./demuxer/ts');
const M3U8Parser = require('./demuxer/m3u8');
const def = require('./consts');
const staticMem = require('./utils/static-mem');
const UI = require('./utils/ui/ui');
const CacheYUV = require('./decoder/cache');
const RenderEngine420P = require('./render-engine/webgl-420p');

// const Module = require('./decoder/missile.js');
// const RawParser = require('./decoder/raw-parser');
// http://localhost:8080/h265webjs-roi/

// const MAX_RETRY_GET_MISSILE_STATE_COUNT = 3;

const DEFAULT_CONFIG_EXT = {
    moovStartFlag : true,
    readyShow : true,
    rawFps : 24,
    autoCrop : false,
    core : def.PLAYER_CORE_TYPE_DEFAULT,
    coreProbePart : 0.0,
    checkProbe : true,
    ignoreAudio : 0, // 0 no 1 yes
    probeSize : 4096,
    autoPlay : false,
    cacheLength : 50,
    loadTimeout : 30, // 30s
    hevc : true,
}; // DEFAULT_CONFIG_EXT

/**
 * if duration is 1000ms, fps 24, so 1 frame 40ms
 * the last frame start by 1000ms - 40ms
 * this duration is last start time.
 * @param fps float64
 * @param duration float64 micro seconds
 */
const GetRealDurationOfLastFramePTS = (fps, duration) => {
    return duration - (1000.0 / fps);
};

if (global.Module === undefined || global.Module === null) {
    global.Module = {};
} // Module check

Module.onRuntimeInitialized = () => {
    global.STATIC_MEM_wasmDecoderState = 1;
    console.log('WASM initialized ' + global.STATIC_MEM_wasmDecoderState);
    // Module['ENVIRONMENT_IS_PTHREAD'] = true;
    // _this._makeMP4Player();
    // global.STATICE_MEM_playerIndexPtr += 1;
    // _this._playerUtilBuildMask(_this.configFormat.playIcon);
    // _this._playUtilShowMask();
}; // onRuntimeInitialized

window.g_players = {};

window.onmessage = (event) => {
    console.log("window.onmessage", event);
};

window.addEventListener("wasmLoaded", function()
{
    // document.domain = COMMON_DEF.RUN_DOMAIN;
    // document.domain = RUN_DOMAIN;
    global.STATIC_MEM_wasmDecoderState = 1;
    console.log("wasmLoaded");
    // Run();
    // let worker1 = new Worker(AVCOMMON.GetScriptPath(function() {
    //     // importScripts('http://localhost:8080/VideoMissile/VideoMissilePlayer/dist/missile-v20220421-worker.js');
    //     let _self = self;
    //     self.onmessage = (event) => {
    //         console.log("dc-worker.js ==> onmessage ", event);
    //         let offset = Module._malloc(1);
    //     };
    // }));
    // worker1.postMessage("aaa");

    // let worker1 = new Worker('./dist/dc-worker-dist.js');
    // setTimeout(function() {
    //     worker1.postMessage("aaa");
    // }, 2000);
    
}); // wasmLoaded

global.onWASMLoaded = function() {
    global.STATIC_MEM_wasmDecoderState = 1;
    console.log("onWASMLoaded");
};

class H265webjsModule {
    // static myStaticProp = 42;

    /**
     * @param videoURL String
     * @param config Dict: {
     *              player : string
     *              width : int32
     *              height : int32
     * }
     */
    constructor(videoURL, config) {
        global.STATICE_MEM_playerCount += 1;
        this.playerIndex = global.STATICE_MEM_playerCount;

        // Module
        // this.rawParserObj = null;
        this.mp4Obj = null;
        this.mpegTsObj = null;
        this.hlsObj = null;
        this.hlsConf = {
            hlsType : def.PLAYER_IN_TYPE_M3U8_VOD
        }; // hlsConf

        // this.uiObj = new UI.UI();

        // this.snapshotCanvas = null;
        this.snapshotCanvasContext = null;
        this.snapshotYuvLastFrame = {
            width: 0,
            height: 0,
            luma: null,
            chromaB: null,
            chromaR: null
        }; // snapshotYuvLastFrame

        // val
        this.videoURL = videoURL;
        this.configFormat = {
            playerId : config.player || def.DEFAILT_WEBGL_PLAY_ID,
            playerW : config.width || def.DEFAULT_WIDTH,
            playerH : config.height || def.DEFAULT_HEIGHT,
            // type : config.type || def.PLAYER_IN_TYPE_MP4,
            // this params is player-core value, flv/mp4 => mp4
            // if u want real format, use this.mediaExtFormat
            type : config.type || AVCOMMON.GetUriFormat(this.videoURL),
            accurateSeek : config.accurateSeek || true,
            playIcon : config.playIcon || "assets/icon-play@300.png",
            loadIcon : config.loadIcon || "assets/icon-loading.gif",
            token : config.token || null,
            extInfo : DEFAULT_CONFIG_EXT
        }; // configFormat
        this.mediaExtFormat = this.configFormat.type;
        this.mediaExtProtocol = null;
        if (this.videoURL !== undefined && this.videoURL !== null) {
            this.mediaExtProtocol = AVCOMMON.GetUriProtocol(this.videoURL);
        }

        console.log("GetUriProtocol", this.mediaExtProtocol, this.mediaExtFormat);

        // alert(this.configFormat.type);

        /*****************************************
         *
         *        Config Install Start
         *
         *****************************************/
        if (this.configFormat.token == null) {
            alert("请输入TOKEN！Please set token param!");
            return;
        } // token is null

        this.configFormat.extInfo.core = 
            AVCOMMON.GetFormatPlayCore(this.configFormat.type);
        // alert(this.configFormat.extInfo.core);

        for (let confKey in config.extInfo) {
            if (confKey in this.configFormat.extInfo) {
                this.configFormat.extInfo[confKey] = config.extInfo[confKey];
                // alert("update " + confKey 
                //     + " to " + this.configFormat.extInfo[confKey]);
            }
        } // end for
        /********************************************
         *
         *           Config Install End
         *
         ********************************************/

        this.playMode = def.PLAYER_MODE_VOD;
        this.seekTarget = 0;
        this.playParam = null; // {durationMs ... }

        this.timerFeed = null;
        this.player = null;
        this.volume = 1.0;

        this.rawModePts = 0.0; // only use in raw 265 mode

        // interval
        this.loadTimeoutInterval = null;
        this.loadTimeoutSecNow = this.configFormat.extInfo.loadTimeout;

        // screen
        this.autoScreenClose = true;

        // func
        this.feedMP4Data = null;
        this.workerFetch = null;
        this.workerParse = null;

        // Event
        // param pts
        this.onPlayTime = null;
        this.onLoadFinish = null;
        // this.onMaskClick = null;
        this.onSeekStart = null;
        this.onSeekFinish = null;
        this.onRender = null;
        this.onLoadCache = null;
        this.onLoadCacheFinshed = null;
        this.onPlayFinish = null;
        this.onCacheProcess = null;
        this.onReadyShowDone = null;
        this.onOpenFullScreen = null;
        this.onCloseFullScreen = null;
        this.onError = null;
        this.onProbeError = null;
        this.onMakeItReady = null;
        this.onPlayState = null;

        this.filterConfigParams();
        console.log("configFormat ==> ", this.configFormat);

        let _this = this;
        document.addEventListener("fullscreenchange", function(event) {
            // console.log("fullscreenchange", event);
            if (_this._isFullScreen()) {
                _this.onOpenFullScreen && _this.onOpenFullScreen();
            } else {
                if (_this.autoScreenClose === true) {
                    _this.closeFullScreen(true);
                }
                 _this.onCloseFullScreen && _this.onCloseFullScreen();
            }
        });

        this.screenW = window.screen.width;
        this.screenH = window.screen.height;
    } // constructor

    filterConfigParams() {
        if (this.configFormat.extInfo.checkProbe === undefined || this.configFormat.extInfo.checkProbe === null) {
            this.configFormat.extInfo.checkProbe = true;
        }

        if (this.configFormat.type === def.PLAYER_IN_TYPE_FLV) {
            this.configFormat.extInfo.core  = def.PLAYER_CORE_TYPE_CNATIVE;
            this.configFormat.type          = def.PLAYER_IN_TYPE_MP4; // LIVE

        } else if (this.configFormat.type === def.PLAYER_IN_TYPE_HTTPFLV) {
            this.configFormat.extInfo.core  = def.PLAYER_CORE_TYPE_CNATIVE;
            this.configFormat.type          = def.PLAYER_IN_TYPE_MP4;
            this.playMode                   = def.PLAYER_MODE_NOTIME_LIVE;
        }

    }

    /**********
     Public
     **********/
    do() {
        let _this = this;
        // durationMs, fps, sampleRate, size
        let audioNone = false;

        if (this.configFormat.extInfo.ignoreAudio > 0) {
            audioNone = true;
        }
        // 流265 无音频
        if (this.configFormat.type === def.PLAYER_IN_TYPE_RAW_265) {
            audioNone = true;
            this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
        }

        this.playParam = {
            durationMs : 0,
            fps : 0,
            sampleRate : 0,
            size : {
                width : 0,
                height : 0
            },
            audioNone : audioNone,
            videoCodec : def.CODEC_H265
        }; // end this.playParam

        UI.UI.createPlayerRender(this.configFormat.playerId, this.configFormat.playerW, this.configFormat.playerH);

        if (this._isSupportWASM() === false) {
            this._makeMP4Player(false);
            return 0;
        }

        if (this.configFormat.extInfo.hevc === false) {
            let avpinit_ret = Module.cwrap("AVPlayerInit", "number", ["string", "string"])(
                this.configFormat.token, '0.0.0'
            );
            
            // AVPlayerInit
            const native = true;
            this._makeMP4Player(native);
            return 0;
        }

        let initInterval = window.setInterval(() => {
            if (global.STATICE_MEM_playerIndexPtr === _this.playerIndex) {
                console.log("global.STATICE_MEM_playerIndexPtr === _this.playerIndex:", global.STATICE_MEM_playerIndexPtr, _this.playerIndex);
                if (!window.WebAssembly) {
                    let tip = 'unsupport WASM!';
                    if (/iPhone|iPad/.test(window.navigator.userAgent)) {
                        tip += ' ios:min-version 11'
                    }
                    alert(tip);
                    alert("Please check your browers, it not support wasm! See:https://www.caniuse.com/#search=wasm");

                    global.STATICE_MEM_playerIndexPtr += 1;
                    window.clearInterval(initInterval);
                    initInterval = null;
                } else {
                    console.log("to onRuntimeInitialized "
                        + global.STATIC_MEM_wasmDecoderState);
                    if (global.STATIC_MEM_wasmDecoderState == 1) {
                        console.log("wasm already inited!");
                        // if (_this.configFormat.type == def.PLAYER_IN_TYPE_MP4) {
                            _this._makeMP4Player();
                            // _this._playerUtilBuildMask(_this.configFormat.playIcon);
                            // _this._playUtilShowMask();
                        // }
                        global.STATICE_MEM_playerIndexPtr += 1;
                        window.clearInterval(initInterval);
                        initInterval = null;
                    } else {
                        console.log("to onRuntimeInitialized");
                        // Module.onRuntimeInitialized = () => {
                        //     global.STATIC_MEM_wasmDecoderState = 1;

                        //     console.log('WASM initialized ' + global.STATIC_MEM_wasmDecoderState);
                        //     // let ret1 = Module.cwrap('initMissile', 'number', [])();
                        //     // console.log(ret1);
                        //     // console.log('Initialized Decoder');
                        //     // ret1 = Module.cwrap('initializeDecoder', 'number', [])();
                        //     // console.log(ret1);

                        //     _this._makeMP4Player();
                        //     global.STATICE_MEM_playerIndexPtr += 1;
                        //     // _this._playerUtilBuildMask(_this.configFormat.playIcon);
                        //     // _this._playUtilShowMask();
                        // };
                    }
                } // end if c
            }
        }, 500);
    } // do

    release() {
        if (this.player === undefined || this.player === null) {
            return false;
        }
        console.log("===>", this.player);
        if (this.playParam.videoCodec === def.CODEC_H265 && this.player) {
            if (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8 
                && this.hlsObj !== undefined && this.hlsObj !== null) {
                this.hlsObj.release();
            }
            this.player.release();
        } else {
            this.player.release(); // keep
        }

        if (this.snapshotCanvasContext !== undefined &&
            this.snapshotCanvasContext !== null) 
        {
            RenderEngine420P.releaseContext(this.snapshotCanvasContext);
            this.snapshotCanvasContext = null;

            if (this.snapshotYuvLastFrame !== undefined && 
                this.snapshotYuvLastFrame !== null) 
            {
                this.snapshotYuvLastFrame.luma     = null;
                this.snapshotYuvLastFrame.chromaB  = null;
                this.snapshotYuvLastFrame.chromaR  = null;

                this.snapshotYuvLastFrame.width    = 0;
                this.snapshotYuvLastFrame.height   = 0;
            }
        } // end free snapshot info

        if (this.workerFetch !== undefined && this.workerFetch !== null) {
            this.workerFetch.postMessage({
                cmd: 'stop',
                params: '',
                type: this.mediaExtProtocol,
            });
            this.workerFetch.onmessage = null;
        }

        if (this.workerParse !== undefined && this.workerParse !== null) {
            this.workerParse.postMessage({
                cmd: 'stop',
                params: '',
            });
            this.workerParse.onmessage = null;
        }
        
        this.workerFetch = null;
        this.workerParse = null;

        this.configFormat.extInfo.readyShow = true;

        window.onclick = document.body.onclick = null;
        window.g_players = {};
        return true;
    }

    debugYUV(debugID) {
        this.player.debugYUV(debugID);
    }

    setPlaybackRate(rate=1.0) {
        if (this.playParam.videoCodec === def.CODEC_H265 || 
            rate <= 0.0 || 
            this.player === undefined || this.player === null) {
            return false;
        }
        // playbackRate
        return this.player.setPlaybackRate(rate);
    }

    getPlaybackRate() {
        if (this.player === undefined || this.player === null) {
            return false;
        }
        if (this.playParam.videoCodec === def.CODEC_H265) {
            return 1.0;
        }
        return this.player.getPlaybackRate();
    }

    setRenderScreen(setVal = false) {
        if (this.player === undefined || this.player === null) {
            return false;
        }
        this.player.setScreen(setVal);
        return true;
    }

    play() {
        if (this.player === undefined || this.player === null) {
            return false;
        }

        // this._playUtilHiddenMask();
        if (this.playParam.videoCodec === def.CODEC_H265) {
            let playParams = {
                seekPos : this._getSeekTarget(), 
                mode : this.playMode, 
                accurateSeek : this.configFormat.accurateSeek, 
                seekEvent : false,
                realPlay : true
            };
            this.player.play(playParams);
        } else {
            this.player.play();
        }
        return true;
    }

    pause() {
        if (this.player === undefined || this.player === null) {
            return false;
        }
        console.log("=====================PAUSE====================");
        // this._playerUtilBuildMask(this.configFormat.playIcon);
        // this._playUtilShowMask();
        this.player.pause();
        return true;
    }

    isPlaying() {
        if (this.player === undefined || this.player === null) {
            return false;
        }
        return this.player.isPlayingState();
    }

    setVoice(voice) {
        if (voice < 0) {
            console.log("voice must larger than 0.0!");
            return false;
        }
        if (this.player === undefined || this.player === null) {
            return false;
        }
        this.volume = voice;
        this.player && this.player.setVoice(voice);
        return true;
    }

    getVolume() {
        return this.volume;
    }

    mediaInfo() {
        let mediaInfoData = {
            meta : this.playParam,
            videoType : this.playMode
        }; // end mediaInfoData
        mediaInfoData.meta.isHEVC = this.playParam.videoCodec === 0;
        return mediaInfoData;
    }

    snapshot(canvasDom=null)
    {
        if (canvasDom === null) {
            return null;
        }

        let _this = this; // this.snapshotCanvas
        if (this.playParam !== undefined && this.playParam !== null)
        {
            // this.snapshotCanvas = canvasDom;

            // audioNone: false // 是否不包含音频轨
            // durationMs: 600000 // 时长 毫秒级
            // fps: 25 // 帧率
            // sampleRate: 44100 // 音频采样率
            // size: // 视频分辨率
            //     height: 720
            //     width: 1280
            // videoCodec: 0 // 0:HEVC/H.265 1:其他编码
            // isHEVC: true // 是否是H265编码视频

            if (this.playParam.videoCodec === 0) { // HEVC
                this.player.setScreen(true);

                canvasDom.width = this.snapshotYuvLastFrame.width;
                canvasDom.height = this.snapshotYuvLastFrame.height;
                console.log("this.snapshotYuvLastFrame", this.snapshotYuvLastFrame);

                // RenderEngine420P
                if (this.snapshotCanvasContext === undefined || 
                    this.snapshotCanvasContext === null)
                {
                    this.snapshotCanvasContext = RenderEngine420P.setupCanvas(
                        canvasDom, 
                        {
                            preserveDrawingBuffer: false
                        }
                    ); // snapshotCanvasContext
                }

                RenderEngine420P.renderFrame(
                    this.snapshotCanvasContext,
                    this.snapshotYuvLastFrame.luma, 
                    this.snapshotYuvLastFrame.chromaB, 
                    this.snapshotYuvLastFrame.chromaR,
                    this.snapshotYuvLastFrame.width, 
                    this.snapshotYuvLastFrame.height);
            } else { // AVC
                canvasDom.width = this.playParam.size.width;
                canvasDom.height = this.playParam.size.height;
                canvasDom.getContext('2d').drawImage(
                    this.player.videoTag, 
                    0, 0, canvasDom.width, canvasDom.height);
                
            } // end check codec
        } // check params exist

        return null;
    } // snapshot

    _seekHLS(clickedValue, _self, callback) {
        // alert("seekHLS" + clickedValue);
        if (this.player === undefined || this.player === null) {
            return false;
        }
        setTimeout(function() {
            console.warn("this.player.getCachePTS()", _self.player.getCachePTS());
            if (_self.player.getCachePTS() > clickedValue) {
                // alert("start seekHLS");
                // this.hlsObj.onSamples = null;
                // this.hlsObj.seek(clickedValue);
                callback();
                return;
            } else {
                _self._seekHLS(clickedValue, _self, callback);
            }
        }, 100);
    }

    seek(clickedValue) {
        console.log("============DEBUG===========> SEEK TO:", clickedValue);

        if (this.player === undefined || this.player === null) {
            return false;
        }

        let _this = this;
        this.seekTarget = clickedValue;

        this.onSeekStart && this.onSeekStart(clickedValue);

        if (this.timerFeed) {
            window.clearInterval(this.timerFeed);
            this.timerFeed = null;
        }

        // accurateSeek or not ,check it and give time's pos
        let seekTime = this._getSeekTarget();
        if (this.playParam.videoCodec === def.CODEC_H264) {
            // && this.configFormat.type == def.PLAYER_IN_TYPE_MP4
            this.player.seek(clickedValue);
            this.onSeekFinish && this.onSeekFinish();
        } else {
            // HEVC
            if (this.configFormat.extInfo.core === def.PLAYER_CORE_TYPE_CNATIVE) {
                // this.player.seek(() => {
                //     console.log("PLAYER_CORE_TYPE_CNATIVE start seek");
                // }, { // seek options
                //     seekTime : seekTime,
                //     mode : _this.playMode,
                //     accurateSeek : _this.configFormat.accurateSeek
                // });
                this.pause();
                this._seekHLS(clickedValue, this, function() {
                    _this.player.seek(() => {
                            console.log("PLAYER_CORE_TYPE_CNATIVE start seek");
                        }, { // seek options
                            seekTime : seekTime,
                            mode : _this.playMode,
                            accurateSeek : _this.configFormat.accurateSeek
                        }
                    ); // end player.seek
                }); // end seekHLS
            } else { // default core
                this._seekHLS(clickedValue, this, function() {
                    _this.player.seek(
                        () => { // call
                            if (_this.configFormat.type == def.PLAYER_IN_TYPE_MP4) {
                                // _this.mp4Obj.seek(_this.seekTarget);
                                _this.mp4Obj.seek(clickedValue);
                            } else if (
                                _this.configFormat.type == def.PLAYER_IN_TYPE_TS ||
                                _this.configFormat.type == def.PLAYER_IN_TYPE_MPEGTS)
                            {
                                // _this.mpegTsObj.seek(_this.seekTarget);
                                _this.mpegTsObj.seek(clickedValue);
                            } else if (_this.configFormat.type == def.PLAYER_IN_TYPE_M3U8) 
                            {
                                // alert("hls seek to" + clickedValue);
                                // _this._seekHLS(clickedValue);
                                /*
                                 * reset HLS INFO
                                 */
                                // 这里去掉,不然append会影响
                                _this.hlsObj.onSamples = null;
                                // _this.hlsObj.onCacheProcess = null;

                                // _this.hlsObj.seek(_this.seekTarget);
                                _this.hlsObj.seek(clickedValue);
                            }
                            // seekPos
                            let seekFeedTime = function() {
                                let resTime = 0;
                                if (_this.configFormat.accurateSeek) {
                                    resTime = clickedValue;
                                } else {
                                    resTime = _this._getBoxBufSeekIDR();
                                }
                                return parseInt(resTime);
                            } ();

                            // _this.feedMP4Data(_this._getBoxBufSeekIDR(), seekFeedTime);
                            let seekVIdr = parseInt(_this._getBoxBufSeekIDR()) || 0;
                            _this._avFeedMP4Data(
                                seekVIdr, 
                                seekFeedTime);
                        },
                        { // seek options
                            seekTime : seekTime,
                            mode : _this.playMode,
                            accurateSeek : _this.configFormat.accurateSeek
                        }
                    ); // end player.seek
                }); // end seekHLS
            } // end default core
        }
        return true;
    }

    fullScreen() {
        this.autoScreenClose = true;

        console.log("js debug fullScreen => ", this.player.vCodecID, this.player);
        if (this.player.vCodecID === def.V_CODEC_NAME_HEVC) {
            let glCanvasBox = document
                .querySelector('#' + this.configFormat.playerId);
            let glCanvas = glCanvasBox
                .getElementsByTagName('canvas')[0];

            glCanvasBox.style.width = this.screenW + 'px';
            glCanvasBox.style.height = this.screenH + 'px';

            let displayInfo = this._checkScreenDisplaySize(
                this.screenW, this.screenH,
                this.playParam.size.width, this.playParam.size.height);

            glCanvas.style.marginTop = displayInfo[0] + 'px';
            glCanvas.style.marginLeft = displayInfo[1] + 'px';
            glCanvas.style.width = displayInfo[2] + 'px';
            glCanvas.style.height = displayInfo[3] + 'px';

            this._requestFullScreen(glCanvasBox);
        } else {
            this._requestFullScreen(this.player.videoTag);
        }
    }

    closeFullScreen(escClick = false) {
        if (escClick === false) {
            this.autoScreenClose = false;
            this._exitFull();
        }

        if (this.player.vCodecID === def.V_CODEC_NAME_HEVC) {
            let glCanvasBox = document
                .querySelector('#' + this.configFormat.playerId);
            let glCanvas = glCanvasBox
                .getElementsByTagName('canvas')[0];

            glCanvasBox.style.width = this.configFormat.playerW + 'px';
            glCanvasBox.style.height = this.configFormat.playerH + 'px';

            let displayInfo = this._checkScreenDisplaySize(
                this.configFormat.playerW, this.configFormat.playerH,
                this.playParam.size.width, this.playParam.size.height);

            glCanvas.style.marginTop = displayInfo[0] + 'px';
            glCanvas.style.marginLeft = displayInfo[1] + 'px';
            glCanvas.style.width = displayInfo[2] + 'px';
            glCanvas.style.height = displayInfo[3] + 'px';
        }

        // this.autoScreenClose = true;
    } // closeFullScreen

    playNextFrame() {
        this.pause();
        if (this.playParam !== undefined && this.playParam !== null)
        {
            // this.snapshotCanvas = canvasDom;

            // audioNone: false // 是否不包含音频轨
            // durationMs: 600000 // 时长 毫秒级
            // fps: 25 // 帧率
            // sampleRate: 44100 // 音频采样率
            // size: // 视频分辨率
            //     height: 720
            //     width: 1280
            // videoCodec: 0 // 0:HEVC/H.265 1:其他编码
            // isHEVC: true // 是否是H265编码视频

            if (this.playParam.videoCodec === 0) { // HEVC
                this.player.playYUV();
            } else {
                this.player.nativeNextFrame();
            }

            return true;
        } // this.playParam

        return false;
    } // showNextFrame

    resize(width, height) {
        let _this = this;
        // _this.playParam.size = {
        //     width   : _this.player.mediaInfo.width,
        //     height  : _this.player.mediaInfo.height
        // };
        if (this.player !== undefined && this.player !== null) {
            if (!width ||
                !height ||
                !this.playParam.size.width ||
                !this.playParam.size.height
            ) {
                return false;
            }

            const mediaW = this.playParam.size.width;
            const mediaH = this.playParam.size.height;

            const isHEVC = this.playParam.videoCodec === 0;
            const glCanvasBox = document
                .querySelector('#' + this.configFormat.playerId);
            glCanvasBox.style.width = width + "px";
            glCanvasBox.style.height = height + "px";

            if (isHEVC === true) {
                // soft decoder
                let resizeBase = (targetWidth, targetHeight) => {
                    // console.log('checkDisplaySize==========>', targetWidth, targetHeight, mediaW, mediaH);
                    let biggerWidth = mediaW / targetWidth > mediaH / targetHeight;
                    let fixedWidth = (targetWidth / mediaW).toFixed(2);
                    let fixedHeight = (targetHeight / mediaH).toFixed(2);
                    let scaleRatio = biggerWidth ? fixedWidth : fixedHeight;

                    let width = parseInt(mediaW * scaleRatio, 10);
                    let height = parseInt(mediaH * scaleRatio, 10);
                    // console.log(
                    //     'checkDisplaySize ==========>',
                    //     targetWidth, targetHeight, mediaW, mediaH);
                    // console.log(
                    //     'checkDisplaySize ret ==========>', width, height);

                    console.log("debug resize => targetHeight:", targetHeight, ", height:", height);
                    console.log("debug resize => targetWidth:", targetWidth, ", width:", width);

                    let topMargin = parseInt((targetHeight - height) / 2, 10);
                    let leftMargin = parseInt((targetWidth - width) / 2, 10);
                    // console.log(topMargin, leftMargin);
                    // player.isCheckDisplay = true;
                    return [topMargin, leftMargin, width, height];
                }; // end resizeBase

                let glCanvas = glCanvasBox
                    .getElementsByTagName('canvas')[0];

                let resizeData = resizeBase(width, height);
                console.log("debug resize => resizeData:", resizeData);

                glCanvas.style.marginTop = resizeData[0] + 'px';
                glCanvas.style.marginLeft = resizeData[1] + 'px';
                glCanvas.style.width = resizeData[2] + 'px';
                glCanvas.style.height = resizeData[3] + 'px';
            } else {
                // native
                let glCanvas = glCanvasBox
                    .getElementsByTagName('video')[0];

                glCanvas.style.width = width + 'px';
                glCanvas.style.height = height + 'px';
            } // end check avc/hevc resize

            return true;
        }

        return false;
    }

    /**********
     Private
     **********/
    // _getMaskId() {
    //     let maskTag = {
    //         "maskBgId" : 'mask-bg-' + this.configFormat.playerId,
    //         "maskFgId" : 'mask-fg-' + this.configFormat.playerId,
    //         "maskImg" : 'mask-img-' + this.configFormat.playerId,
    //     };
    //     return maskTag
    // }

    // _getMaskDom() {
    //     let maskBgTag = this._getMaskId();
    //     return {
    //         "maskBg" : document.querySelector('div#' + maskBgTag.maskBgId),
    //         "maskFg" : document.querySelector('div#' + maskBgTag.maskFgId),
    //         "maskImg" : document.querySelector('img#' + maskBgTag.maskImg),
    //     }
    // }

    /*
     * full screen
     */
    _checkScreenDisplaySize(
        boxW, boxH,
        widthIn, heightIn
    ) {
        let biggerWidth = widthIn / boxW > heightIn / boxH;
        let fixedWidth = (boxW / widthIn).toFixed(2);
        let fixedHeight = (boxH / heightIn).toFixed(2);
        let scaleRatio = biggerWidth ? fixedWidth : fixedHeight;
        let width = this.fixed ? boxW : parseInt(widthIn  * scaleRatio);
        let height = this.fixed ? boxH : parseInt(heightIn * scaleRatio);

        let topMargin = parseInt((boxH - height) / 2);
        let leftMargin = parseInt((boxW - width) / 2);

        return [topMargin, leftMargin, width, height];
    };

    _isFullScreen() {
        let fullscreenElement =
            document.fullscreenElement
            || document.mozFullscreenElement
            || document.webkitFullscreenElement;
        let fullscreenEnabled =
            document.fullscreenEnabled
            || document.mozFullscreenEnabled
            || document.webkitFullscreenEnabled;
        if (fullscreenElement == null)
        {
            return false;
        } else {
            return true;
        }
    }

    _requestFullScreen(element) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullScreen();
        }
    }

    _exitFull() {
        // let document = this.glCanvasBox.ownerDocument;
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }


    _durationText(duration) {
        if (duration < 0) {
            return "Play";
        }
        let durationSecInt = Math.round(duration);
        return Math.floor(durationSecInt / 3600)
        + ":" + Math.floor((durationSecInt % 3600) / 60)
        + ":" + Math.floor(durationSecInt % 60);
    }

    // _playerUtilBuildMask(iconSrc) {
    //     let _this = this;
    //     let maskBgTag = this._getMaskId();
    //     let canvasBox = document.querySelector('div#' + this.configFormat.playerId);

    //     let maskDom = this._getMaskDom();

    //     let maskBg = maskDom.maskBg == null ? 
    //                     document.createElement('div') : maskDom.maskBg;
    //     let maskImg = maskDom.maskImg == null ? 
    //                     document.createElement('img') : maskDom.maskImg;

    //     maskBg.setAttribute("id", maskBgTag.maskBgId);
    //     maskImg.setAttribute("id", maskBgTag.maskImg);

    //     maskBg.style.width = this.configFormat.playerW + 'px'
    //     maskBg.style.height = this.configFormat.playerH + 'px'
    //     maskBg.style.top = '0px'
    //     maskBg.style.left = '0px'
    //     maskBg.style.position = 'absolute';
    //     // maskBg.style.display = 'none';
    //     maskBg.style.display = 'block';
    //     maskBg.style.backgroundColor = 'black';
    //     maskBg.style.zIndex = '1002';
    //     maskBg.style.opacity = '0.00';
    //     maskBg.style.filter = 'alpha(opacity=0)';

    //     let maskImgWX = Math.floor(this.configFormat.playerW * 0.2);
    //     let maskImgLeft = Math.floor((this.configFormat.playerW - maskImgWX) / 2);
    //     let maskImgTop = Math.floor((this.configFormat.playerH - maskImgWX) / 2);

    //     maskImg.style.width = maskImgWX + "px";
    //     maskImg.style.height = maskImgWX + "px";
    //     maskImg.style.top = maskImgTop + "px";
    //     maskImg.style.left = maskImgLeft + "px";
    //     maskImg.style.display = 'block';
    //     maskImg.style.position = 'absolute';
    //     maskImg.style.zIndex = '1001';
    //     // maskImg.style.backgroundColor = 'yellow';
    //     maskImg.style.overflow = 'auto';
    //     maskImg.style.opacity = '0.00';
    //     maskImg.style.filter = 'alpha(opacity=0)';

    //     maskImg.src = iconSrc;
    //     // maskImg.src = this.configFormat.playIcon;
    //     // maskImg.style.width = maskFg.style.width
    //     // maskImg.style.height = maskFg.style.width

    //     // event
    //     maskBg.onclick = () => {
    //         // 这里比较特殊，只监听播放按钮的
    //         maskImg.src = _this.configFormat.playIcon;
    //         _this._playControl();
    //         if (this.onMaskClick) this.onMaskClick();
    //     };

    //     canvasBox.appendChild(maskBg);
    //     canvasBox.appendChild(maskImg);
    // }

    // _playUtilShowMask() {
    //     let maskDom = this._getMaskDom();
    //     // maskDom.maskBg.style.display = 'block';
    //     maskDom.maskBg.style.opacity = '0.10';
    //     maskDom.maskBg.style.filter = 'alpha(opacity=10)';

    //     maskDom.maskImg.style.opacity = '1.0';
    //     maskDom.maskImg.style.filter = 'alpha(opacity=100)';
    // }

    // _playUtilHiddenMask() {
    //     let maskDom = this._getMaskDom();
    //     // maskDom.maskBg.style.display = 'block';
    //     maskDom.maskBg.style.opacity = '0.00';
    //     maskDom.maskBg.style.filter = 'alpha(opacity=0)';

    //     maskDom.maskImg.style.opacity = '0.00';
    //     maskDom.maskImg.style.filter = 'alpha(opacity=0)';
    //     // maskDom.maskImg.remove();
    // }

    _getSeekTarget() {
        return this.configFormat.accurateSeek ? this.seekTarget : this._getBoxBufSeekIDR();
    }

    _getBoxBufSeekIDR() {
        if (this.configFormat.type == def.PLAYER_IN_TYPE_MP4) {
            return this.mp4Obj.seekPos;
        } else if (this.configFormat.type == def.PLAYER_IN_TYPE_TS
            || this.configFormat.type == def.PLAYER_IN_TYPE_MPEGTS) {
            return this.mpegTsObj.seekPos;
        } else if (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8) {
            return this.hlsObj.seekPos;
        }
    }

    _playControl() {
        this.isPlaying() ? this.pause() : this.play();
    }

    _avFeedMP4Data(secVideoIdx=0, secAudioIdx=0, call=null) {
        let _this = this;
        console.warn("SEEK feedMP4Data:", secVideoIdx, secAudioIdx);

        if (this.player === undefined || this.player === null) {
            return false;
        }

        let durationSec = parseInt(this.playParam.durationMs / 1000);

        // let alreadyPushThisSec = false;
        this.player.clearAllCache();

        this.timerFeed = window.setInterval(() => {
            let videoFrame = null;
            let audioFrame = null;

            // let beforeVFrame = null;
            // let nextAFrame = null;

            let appendV = true;
            let appendA = true;

            if (this.configFormat.type == def.PLAYER_IN_TYPE_MP4) {
                videoFrame = this.mp4Obj.popBuffer(1, secVideoIdx);
                audioFrame = this.mp4Obj.audioNone ? null : this.mp4Obj.popBuffer(2, secAudioIdx);

            } else if (
                this.configFormat.type == def.PLAYER_IN_TYPE_TS ||
                this.configFormat.type == def.PLAYER_IN_TYPE_MPEGTS)
            {
                // console.warn("avFeed mpegts ", this.mpegTsObj);
                videoFrame = this.mpegTsObj.popBuffer(1, secVideoIdx);
                audioFrame = this.mpegTsObj.getAudioNone() ? null : this.mpegTsObj.popBuffer(2, secAudioIdx);

                // if (secVideoIdx > 0)
                //     beforeVFrame = this.mpegTsObj.popBuffer(1, secVideoIdx - 1);

            } else if (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8) {
                
                videoFrame = this.hlsObj.popBuffer(1, secVideoIdx);
                audioFrame = this.hlsObj.audioNone ? null : this.hlsObj.popBuffer(2, secAudioIdx);

                // console.warn("avFeed this.hlsObj", videoFrame);

                if (secVideoIdx < durationSec - 1) {
                    if (secVideoIdx >= this.hlsObj.getLastIdx()) {
                        appendV = false;
                    }
                }
                if (secAudioIdx < durationSec - 1) {
                    if (secAudioIdx >= this.hlsObj.getALastIdx()) {
                        appendA = false;
                    }
                }
            }

            ////////////////// V A push START ///////////////////
            if (appendV === true 
                && videoFrame !== null && videoFrame !== undefined) 
            {
                for (let i = 0; i < videoFrame.length; i++) {
                    this.player.appendHevcFrame(videoFrame[i]);
                }
            }

            if (appendA === true 
                && audioFrame !== null && audioFrame !== undefined) 
            {
                for (let i = 0; i < audioFrame.length; i++) {
                    this.player.appendAACFrame(audioFrame[i]);
                }
            }
            ////////////////// V A push END ///////////////////

            if (this.playMode !== def.PLAYER_MODE_NOTIME_LIVE 
                && this.configFormat.type !== def.PLAYER_IN_TYPE_M3U8) 
            {
                this.onCacheProcess && this.onCacheProcess(this.player.getCachePTS());
            }

            if (appendV === true 
                && videoFrame !== null 
                && videoFrame !== undefined) 
            {
                console.warn("videoFrame GET:", secVideoIdx, videoFrame.length);
                // 首帧显示渲染
                if (this.configFormat.extInfo.readyShow) 
                {
                    if (this.configFormat.type === def.PLAYER_IN_TYPE_M3U8) 
                    {
                        this.configFormat.extInfo.readyShow = false;
                        // this.onReadyShowDone && this.onReadyShowDone();
                    } else {
                        // alert("============== readyShow");

                        if (this.configFormat.extInfo.core === def.PLAYER_CORE_TYPE_CNATIVE) 
                        {
                            // if (this.player.cacheIsFull()) {
                            //     this.player.playFrameYUV(true, true);
                            //     this.configFormat.extInfo.readyShow = false;
                            //     this.onReadyShowDone && this.onReadyShowDone();
                            // }
                        } else {
                            if (this.player.cacheYuvBuf.getState() != CACHE_APPEND_STATUS_CODE.NULL) 
                            {
                                // if (this.player.playYUV(true, true) === true) {
                                //     this.configFormat.extInfo.readyShow = false;
                                //     this.onReadyShowDone && this.onReadyShowDone();
                                // }
                            }
                            if (this.player.playYUV(true, true) === true) 
                            {
                                this.configFormat.extInfo.readyShow = false;
                                this.onReadyShowDone && this.onReadyShowDone();
                            }
                        } // end core
                    } // end if  check type
                } // end if readyShow

                // if (this.configFormat.extInfo.cacheBuffer) {
                //     this.player.cacheThread();
                // }
                secVideoIdx++;
            }
            if (appendA === true 
                && audioFrame !== null && audioFrame !== undefined) 
            {
                secAudioIdx++;
            }

            // set beforeLength
            // if (videoFrame !== null 
            //     && videoFrame !== undefined) 
            // {
            //     beforeLength = videoFrame.length;
            // }

            // console.log(secVideoIdx + "," + secAudioIdx + "," + durationSec);
            // videoFrame == null && audioFrame == null && 
            // || this.player.getCachePTS() > durationSec
            if (secVideoIdx > durationSec) { //  || secAudioIdx >= durationSec
                window.clearInterval(this.timerFeed);
                this.timerFeed = null;
                console.log("avFeedMP4Data loading finished ==> "
                    + "[secVideoIdx > durationSec", secVideoIdx, durationSec
                    + "],[player.vCachePTS, player.aCachePTS", this.player.vCachePTS, this.player.aCachePTS);
                // console.log(videoFrame, audioFrame);

                if (call != null) {
                    call();
                }
                return;
            }
        }, 5);
    } // _avFeedMP4Data

    _isSupportWASM() {
        let document = window.document;
		let navigator = window.navigator;
		let sUserAgent = navigator.userAgent.toLowerCase();

		let bIsIpad = sUserAgent.match(/ipad/i) == "ipad";
		let bIsIphoneOs = sUserAgent.match(/iphone os/i) == "iphone os";

		let bIsIpad2 = sUserAgent.match(/iPad/i) == "iPad";
		let bIsIphoneOs2 = sUserAgent.match(/iPhone os/i) == "iPhone os";

		let bIsMidp = sUserAgent.match(/midp/i) == "midp";
		let bIsUc7 = sUserAgent.match(/rv:1.2.3.4/i) == "rv:1.2.3.4";
		let bIsUc = sUserAgent.match(/ucweb/i) == "ucweb";

		let bIsAndroid = sUserAgent.match(/android/i) == "android";
		let bIsAndroid2 = sUserAgent.match(/Android/i) == "Android";

		let bIsCE = sUserAgent.match(/windows ce/i) == "windows ce";
		let bIsWM = sUserAgent.match(/windows mobile/i) == "windows mobile";

		if (bIsIpad || bIsIphoneOs || bIsIpad2 || bIsIphoneOs2 || bIsMidp ||
			bIsUc7 || bIsUc || bIsAndroid || bIsAndroid2 || bIsCE || bIsWM)
		{
			return false;
		}

        const supported = (() => {
            try {
                if (typeof WebAssembly === "object"
                    && typeof WebAssembly.instantiate === "function") {
                    const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
                    if (module instanceof WebAssembly.Module)
                        return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
                }
            } catch (e) {
            }
            return false;
        }) ();

        console.log(supported ? "WebAssembly is supported" : "WebAssembly is not supported");

        if (supported === false) {
            return false;
        }

        if (supported === true) {
            const browser_info = AVCOMMON.BrowserJudge();
            const browser_type = browser_info[0];
            const browser_version = browser_info[1];
            console.log("BrowserJudge:", browser_type, browser_version);
            if (browser_type === 'Chrome' && browser_version < 85) {
                return false;
            }

            if (browser_type.indexOf("360") >= 0) {
                return false;
            }

            if(
                (
                    /Safari/.test(navigator.userAgent) 
                    && !/Chrome/.test(navigator.userAgent)
                ) && 
                browser_version > 13
            ) {
                console.log("BrowserJudge:", 
                    browser_version < 13, browser_version > 10);
                return false;
            }
        }

        return true;
    }

    _makeMP4Player(native=false) {
        let _this = this;

        console.log("_isSupportWASM", this._isSupportWASM());

        if (this._isSupportWASM() === false || native === true) {
            if (this.configFormat.type == def.PLAYER_IN_TYPE_MP4) {

                if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) {
                    console.log("go flv");
                    this._flvJsPlayer(this.playParam.durationMs, _this.playParam.audioNone); // flvjs
                } else {
                    console.log("go mp4");
                    this._makeNativePlayer();
                }
            } else if (
                this.configFormat.type == def.PLAYER_IN_TYPE_TS ||
                this.configFormat.type == def.PLAYER_IN_TYPE_MPEGTS)
            {
                console.log("go ts");
                //this._mpegTsEntry();
                this._mpegTsNv3rdPlayer(-1, false);
                // return -1;
            } else if (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8) {
                console.log("go m3u8");
                //this._videoJsPlayer(0);
                this._videoJsPlayer();
            } else if (this.configFormat.type === def.PLAYER_IN_TYPE_RAW_265) {
                console.log("go raw265");
                // this._raw265Entry();
                return -1;
            }
            return 1;
        }

        /*
         * Switch Media
         */
        // alert("type: " + this.configFormat.type);

        if (this.mediaExtProtocol === def.URI_PROTOCOL_WEBSOCKET_DESC) {
            console.log("this.configFormat.type", this.configFormat.type);
            if (this.configFormat.type === def.PLAYER_IN_TYPE_RAW_265) {
                this._raw265Entry();
            } else {
                this._cWsFLVDecoderEntry();
            }
            return 0;
        }

        if (this.configFormat.extInfo.core != undefined 
            && this.configFormat.extInfo.core !== null
            && this.configFormat.extInfo.core === def.PLAYER_CORE_TYPE_CNATIVE
        ) { // @TODO make http-ts add here
            /*
             * PLAYER_CORE_TYPE_CNATIVE c demuxer decoder
             */
            console.log("_makeMP4Player _cDemuxDecoderEntry");
            this._cDemuxDecoderEntry();

        } else {
            if (this.configFormat.type == def.PLAYER_IN_TYPE_MP4) {
                if (this.configFormat.extInfo.moovStartFlag) {
                    this._mp4EntryVodStream();
                } else {
                    this._mp4Entry();
                }
            } else if (
                this.configFormat.type == def.PLAYER_IN_TYPE_TS ||
                this.configFormat.type == def.PLAYER_IN_TYPE_MPEGTS)
            {
                console.log("go ts");
                this._mpegTsEntry();
            } else if (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8) {
                console.log("go m3u8");
                this._m3u8Entry();
            } else if (this.configFormat.type === def.PLAYER_IN_TYPE_RAW_265) {
                console.log("go raw265");
                this._raw265Entry();
            }
        }

        return 0;
    } // _makeMP4Player end

    /**
     * 内部公共调用的一个方法 创建播放器
     */
    _makeMP4PlayerViewEvent(
        durationMs, fps, sampleRate, size, audioNone=false, videoCodec=null) 
    {
        let _this = this;
        // set play params in this entry
        this.playParam.durationMs = durationMs;
        this.playParam.fps = fps;
        this.playParam.sampleRate = sampleRate;
        this.playParam.size = size;
        this.playParam.audioNone = audioNone;
        this.playParam.videoCodec = videoCodec || def.CODEC_H265;
        console.log("this.playParam: ", this.playParam);

        if (
            (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8 
            && this.hlsConf.hlsType == def.PLAYER_IN_TYPE_M3U8_LIVE)
            || this.configFormat.type == def.PLAYER_IN_TYPE_RAW_265
        ) {
            this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
        }
        // dur seconds
        // let durationSec = parseInt(durationMs / 1000);

        /*
         * autoCrop 如果开启的话 如果画布长宽有问题 就自动裁剪掉
                width   : this.configFormat.playerW,
                height  : this.configFormat.playerH
         */
        if (_this.configFormat.extInfo.autoCrop) {
            let canvasBox = document.querySelector('#' + this.configFormat.playerId);
            let aspectSource = size.width / size.height;
            let aspectDiv = this.configFormat.playerW / this.configFormat.playerH;

            if (aspectSource > aspectDiv) {
                canvasBox.style.height = this.configFormat.playerW / aspectSource + "px";
            } else if (aspectSource < aspectDiv) {
                canvasBox.style.width = this.configFormat.playerH * aspectSource + "px";
            }
        }

        console.log("start init player");
        this.player = Player({
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            sampleRate: sampleRate,
            fps: fps,
            appendHevcType: def.APPEND_TYPE_FRAME, // APPEND_TYPE_SEQUENCE
            fixed: false, // is strict to resolution?
            playerId: this.configFormat.playerId,
            audioNone: audioNone,
            token: this.configFormat.token,
            videoCodec: videoCodec
        });
        this.player.onPlayingTime = videoPTS => {
            let now = _this._durationText(videoPTS);
            let total = _this._durationText(durationMs / 1000);
            // event
            if (_this.onPlayTime != null) _this.onPlayTime(videoPTS);
        };
        this.player.onPlayingFinish = () => {
            this.pause();
            console.log("================> DEBUG this.seek(0)");
            this.seek(0);

            if (this.onPlayFinish != null) {
                this.onPlayFinish();
            }
        };
        this.player.onSeekFinish = () => {
            if (_this.onSeekFinish != null) _this.onSeekFinish();
        };
        this.player.onRender = (width, height, imageBufferY, imageBufferB, imageBufferR) => 
        {
            _this.snapshotYuvLastFrame.luma     = null;
            _this.snapshotYuvLastFrame.chromaB  = null;
            _this.snapshotYuvLastFrame.chromaR  = null;

            _this.snapshotYuvLastFrame.width    = width;
            _this.snapshotYuvLastFrame.height   = height;
            _this.snapshotYuvLastFrame.luma     = new Uint8Array(imageBufferY);
            _this.snapshotYuvLastFrame.chromaB  = new Uint8Array(imageBufferB);
            _this.snapshotYuvLastFrame.chromaR  = new Uint8Array(imageBufferR);

            // if (_this.snapshotCanvas !== undefined && 
            //     _this.snapshotCanvas !== null) 
            // {
            //     _this.snapshotCanvas.width = width;
            //     _this.snapshotCanvas.height = height;
            // }

            if (_this.onRender != null) {
                _this.onRender(width, height, imageBufferY, imageBufferB, imageBufferR);
            }
        };
        this.player.onLoadCache = () => {
            // this._playerUtilBuildMask(this.configFormat.loadIcon);
            // this._playUtilShowMask();
            if (this.onLoadCache != null) this.onLoadCache();
        };
        this.player.onLoadCacheFinshed = () => {
            // this._playUtilHiddenMask();
            if (this.onLoadCacheFinshed != null) this.onLoadCacheFinshed();
        };

        _this.player.setDurationMs(durationMs);
        _this.player.setFrameRate(fps);

        if (_this.onLoadFinish != null) {
            // alert("onloadfinish");
            _this.onLoadFinish();
            if (
                _this.configFormat.type == def.PLAYER_IN_TYPE_M3U8) {
                _this.onReadyShowDone && _this.onReadyShowDone();
            }
        }
    } // _makeMP4PlayerViewEvent

    _makeNativePlayer(durationMs=0, fps=0, sampleRate=0, size, audioNone=0, videoCodec) {
        let _this = this;
        // set play params in this entry
        this.playParam.durationMs = durationMs;
        this.playParam.fps = fps;
        this.playParam.sampleRate = sampleRate;
        this.playParam.size = size;
        this.playParam.audioNone = audioNone;
        this.playParam.videoCodec = videoCodec || def.CODEC_H264;

        if (this.configFormat.type == def.PLAYER_IN_TYPE_M3U8 &&
            this.hlsConf.hlsType == def.PLAYER_IN_TYPE_M3U8_LIVE) {
            this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
        }

        this.player = new PlayerNative.Mp4Player({
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            sampleRate: sampleRate,
            fps: fps,
            appendHevcType: def.APPEND_TYPE_FRAME, // APPEND_TYPE_SEQUENCE
            fixed: false, // is strict to resolution?
            playerId: this.configFormat.playerId,
            audioNone: audioNone,
            token: this.configFormat.token,
            videoCodec: videoCodec,
            autoPlay: this.configFormat.extInfo.autoPlay,
        });

        // not265mse
        let checkProbeTimeoutCount = 0;
        let checkProbeTimeoutInterval = window.setInterval(function() {
            checkProbeTimeoutCount++;
            if (_this.player === undefined || _this.player === null) {
                window.clearInterval(checkProbeTimeoutInterval);
                checkProbeTimeoutInterval = null;
            }

            if (checkProbeTimeoutCount > def.DEFAULT_PLAYERE_LOAD_TIMEOUT) {
                _this.player.release();
                _this.player = null;

                _this._cDemuxDecoderEntry(0, true);

                window.clearInterval(checkProbeTimeoutInterval);
                checkProbeTimeoutInterval = null;
            }
        }, 1000);

        this.player.makeIt(this.videoURL);

        this.player.onPlayingTime = videoPTS => {
            let now = _this._durationText(videoPTS);
            let total = _this._durationText(durationMs / 1000);
            // event
            if (_this.onPlayTime != null) _this.onPlayTime(videoPTS);
        };

        this.player.onPlayingFinish = () => {
            if (_this.onPlayFinish != null) {
                _this.onPlayFinish();
            }
        };

        this.player.onLoadFinish = () => {
            window.clearInterval(checkProbeTimeoutInterval);
            checkProbeTimeoutInterval = null;

            _this.playParam.durationMs = _this.player.duration * 1000;
            _this.playParam.size = _this.player.getSize();
            _this.onLoadFinish && _this.onLoadFinish();
            _this.onReadyShowDone && _this.onReadyShowDone();
        };

        this.player.onPlayState = (status) => {
            _this.onPlayState && _this.onPlayState(status);
        }; // onPlayState

        this.player.onCacheProcess = (cPts) => {
            _this.onCacheProcess && _this.onCacheProcess(cPts);
        };
    } // _makeNativePlayer

    _initMp4BoxObject() {
        // demux mp4
        this.timerFeed = null;
        this.mp4Obj = new Mp4Parser();

        this.mp4Obj.onMp4BoxReady = (codec) => {
            // let durationMs  = this.mp4Obj.getDurationMs();
            let fps         = this.mp4Obj.getFPS();
            let durationMs  = GetRealDurationOfLastFramePTS(fps, this.mp4Obj.getDurationMs());

            let sampleRate  = this.mp4Obj.getSampleRate();
            let size        = this.mp4Obj.getSize();
            let videoCodec  = this.mp4Obj.getVideoCoder();

            if (codec === def.CODEC_H265) {
                
                this._makeMP4PlayerViewEvent(durationMs, fps, sampleRate, size, this.mp4Obj.audioNone, videoCodec);
                // // dur seconds
                let durationSec = parseInt(durationMs / 1000);
                this._avFeedMP4Data(0, 0);
            } else {
                // native
                this._makeNativePlayer(durationMs, fps, sampleRate, size, this.mp4Obj.audioNone, videoCodec);
            }
        };
    } // _initMp4BoxObject

    /********************************************************************
     ********************************************************************
     ********************                    ****************************
     ********************     media type     ****************************
     ********************                    ****************************
     ********************************************************************
     ********************************************************************/
    _mp4Entry() {
        console.log("==================== _mp4Entry ====================");
        let _this = this;
        fetch(this.videoURL).then(res => res.arrayBuffer()).then(streamBuffer => {
            console.log("============= V DEBUG V ==============");
            console.log(streamBuffer); // ArrayBuffer(12233609) 
            _this._initMp4BoxObject();
            // this.mp4Obj.demux(streamBuffer);
            this.mp4Obj.demux();
            this.mp4Obj.appendBufferData(streamBuffer, 0);
            this.mp4Obj.finishBuffer();
            this.mp4Obj.seek(-1);
        }); // end fetch
    }

    /**
     * 点播 mp4流式
     */
    _mp4EntryVodStream() {
        console.log("==================== _mp4EntryVodStream ====================");
        let _this = this;
        // demux mp4
        this.timerFeed = null;
        this.mp4Obj = new Mp4Parser();
        let progress = 0;
        // let contentLength = 0;

        this._initMp4BoxObject();
        this.mp4Obj.demux();

        let fileStart = 0;
        // let testData = new Uint8Array();
        // let testCount = 1;
        let startFetch = false;
        let networkInterval = window.setInterval(() => {
            if (!startFetch) {
                startFetch = true;
                fetch(this.videoURL).then(function(response) {
                    // get the size of the request via the headers of the response
                    // contentLength = response.headers.get('Content-Length');

                    let pump = function(reader) {
                        return reader.read().then(function(result) {
                            // if we're done reading the stream, return
                            if (result.done) {
                                // _this.mp4Obj.appendBufferData(testData.buffer, 0);
                                console.log("========== RESULT DONE ===========");
                                _this.mp4Obj.finishBuffer();
                                _this.mp4Obj.seek(-1);
                                window.clearInterval(networkInterval);
                                return;
                            }

                            // retrieve the multi-byte chunk of data
                            let chunk = result.value;
                            // test
                            // let tmpData = new Uint8Array(testData.length + chunk.length);
                            // tmpData.set(testData, 0);
                            // tmpData.set(chunk, testData.length);
                            // testData = tmpData;

                            // if (testCount > 10) {
                            //     _this.mp4Obj.appendBufferData(testData.buffer, 0);
                            //     _this.mp4Obj.finishBuffer();
                            //     _this.mp4Obj.seek(-1);
                            //     return;
                            // }
                            // testCount += 1;

                            _this.mp4Obj.appendBufferData(chunk.buffer, fileStart);
                            /*
                             * Uint8Array
                             */
                            // console.log("getData ------------------ V ---------------------");
                            // console.log(chunk.byteLength);
                            // total_len += result.value.length; // byteLength
                            // console.log("total_len", total_len);
                            fileStart += chunk.byteLength; // = ?chunk.length
                            // since the chunk can be multiple bytes, iterate through
                            // each byte while skipping the byte order mark
                            // (assuming UTF-8 with single-byte chars)
                            // for (var i = 3; i < chunk.byteLength; i++) {
                            //     text += String.fromCharCode(chunk[i]);
                            // }

                            // append the contents to the page
                            // document.getElementById('content').innerHTML += text;
                            // console.log(text);

                            // report our current progress
                            // progress += chunk.byteLength;
                            // console.log(((progress / contentLength) * 100) + '%');

                            // go to next chunk via recursion
                            return pump(reader);
                        });
                    }

                    // start reading the response stream
                    return pump(response.body.getReader());
                })
                .catch(function(error) {
                    console.log(error);
                });
            }
        }, 1);
    } // end _mp4EntryVodStream

    /**
     *
     *
     * Demuxer + Decoder
     *
     */
    _cDemuxDecoderEntry(retry=0, not265mse = false) {
        console.log(
            "_cDemuxDecoderEntry ==> ", this.configFormat.type, retry);
        let _this = this;
        let probeSuccessed = false;
        // let playerConfBase = {
        //     width: this.configFormat.playerW,
        //     height: this.configFormat.playerH,
        //     playerId: this.configFormat.playerId,
        //     token: this.configFormat.token,
        //     readyShow: this.configFormat.extInfo.readyShow,
        //     ignoreAudio : this.configFormat.extInfo.ignoreAudio,
        // };
        let controller = new AbortController();
        let signal = controller.signal;

        let playerConfig = {
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            playerId: this.configFormat.playerId,
            token: this.configFormat.token,
            readyShow: this.configFormat.extInfo.readyShow,
            checkProbe: this.configFormat.extInfo.checkProbe,
            ignoreAudio : this.configFormat.extInfo.ignoreAudio,
            playMode: this.playMode,
            autoPlay: this.configFormat.extInfo.autoPlay,
            defaultFps: this.configFormat.extInfo.rawFps,
            cacheLength: this.configFormat.extInfo.cacheLength,
        };
        this.player = new CNativeCore.CNativeCore(playerConfig); // end create player
        // window.testPlayer = this.player;
        window.g_players[this.player.corePtr] = this.player;

        this.player.onReadyShowDone = () => {
            _this.configFormat.extInfo.readyShow = false;
            _this.onReadyShowDone && _this.onReadyShowDone();
        }; // onReadyShowDone

        this.player.onRelease = () => {
            // isReportNetworkErr = false;
            controller.abort();
        };

        /*
         *
         * Set Events
         *
         */
        this.player.onProbeFinish = () => { // GetRealDurationOfLastFramePTS(fps, this.mp4Obj.getDurationMs());
            probeSuccessed = true;
            console.log("first probe ", _this.player.config, _this.player.audioNone);
            _this.playParam.fps          = _this.player.config.fps;
            _this.playParam.durationMs   = GetRealDurationOfLastFramePTS(_this.playParam.fps, _this.player.duration * 1000.0);

            if (_this.player.duration < 0) { // LIVE
                _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
                _this.playParam.durationMs = -1;
                alert("HTTP FLV LIVE");
            }

            _this.playParam.sampleRate   = _this.player.config.sampleRate;
            _this.playParam.size = {
                width   : _this.player.width,
                height  : _this.player.height
            };
            _this.playParam.audioNone = _this.player.audioNone;

            if (_this.player.vCodecID === def.V_CODEC_NAME_HEVC) {
                _this.playParam.videoCodec = def.CODEC_H265;
                if (_this.playParam.audioIdx < 0) {
                    _this.playParam.audioNone = true;
                }
                if (AVCOMMON.IsSupport265Mse() === true 
                    && not265mse === false
                    && 
                    (
                        _this.mediaExtFormat === def.PLAYER_IN_TYPE_MP4
                        || _this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV
                    )
                ) {

                    controller.abort(); // abort fetch http network
                    let releaseRet = _this.player.release();
                    console.log("releaseRet 1 to mse 265 ===> ", releaseRet, _this.mediaExtFormat, def.PLAYER_IN_TYPE_MP4);
                    _this.player = null;

                    if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_MP4) {
                        alert('mp4');
                        _this._makeNativePlayer(
                            _this.playParam.durationMs, _this.playParam.fps,
                            _this.playParam.sampleRate, _this.playParam.size, 
                            false, _this.playParam.videoCodec);
                    } else if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) {
                        // todo flvjs
                        _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone); // flvjs
                    }
                } else {
                    _this.onLoadFinish && _this.onLoadFinish();
                }
            } else {
                // need 264 codec, but do not use
                _this.playParam.videoCodec   = def.CODEC_H264;
                controller.abort(); // abort fetch http network
                let releaseRet = _this.player.release();
                console.log("releaseRet 2 to native 264 ===> ", releaseRet);
                _this.player = null;

                if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_MP4) {
                    _this._makeNativePlayer(
                        _this.playParam.durationMs, _this.playParam.fps, 
                        _this.playParam.sampleRate, _this.playParam.size, 
                        false, _this.playParam.videoCodec);
                } else if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) {
                    // todo flvjs
                    _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone); // flvjs
                } else {
                    _this.onLoadFinish && _this.onLoadFinish();
                }
            }
            // _this.onLoadFinish && _this.onLoadFinish();
        }; // onProbeFinish

        this.player.onPlayingTime = (pts) => {
            let now = _this._durationText(pts);
            let total = _this._durationText(_this.player.duration);
            // event
            if (_this.onPlayTime != null) _this.onPlayTime(pts);
        }; // onPlayingTime

        this.player.onPlayingFinish = () => {
            _this.pause();
            if (_this.onPlayTime != null) _this.onPlayTime(0);
            _this.onPlayFinish && _this.onPlayFinish();

            /*
             *
             * @Todo 临时释放，之后得用真正的Seek操作
             *
             */
            // let releaseRet = _this.player.release();
            // console.log("releaseRet ===> ", releaseRet);
            // _this.player.reFull();
            _this.player.reFull = true;
            _this.seek(0);
            // @TODO
            // this.player = null;
            // this._cDemuxDecoderEntry();
        }; // onPlayingFinish

        this.player.onCacheProcess = (cPts) => {
            this.onCacheProcess && this.onCacheProcess(cPts);
        };

        this.player.onLoadCache = () => {
            // this._playerUtilBuildMask(this.configFormat.loadIcon);
            // this._playUtilShowMask();
            if (this.onLoadCache != null) this.onLoadCache();
        };
        this.player.onLoadCacheFinshed = () => {
            // this._playUtilHiddenMask();
            if (this.onLoadCacheFinshed != null) this.onLoadCacheFinshed();
        };

        this.player.onRender = (width, height, imageBufferY, imageBufferB, imageBufferR) => 
        {
            _this.snapshotYuvLastFrame.luma     = null;
            _this.snapshotYuvLastFrame.chromaB  = null;
            _this.snapshotYuvLastFrame.chromaR  = null;

            _this.snapshotYuvLastFrame.width    = width;
            _this.snapshotYuvLastFrame.height   = height;
            _this.snapshotYuvLastFrame.luma     = new Uint8Array(imageBufferY);
            _this.snapshotYuvLastFrame.chromaB  = new Uint8Array(imageBufferB);
            _this.snapshotYuvLastFrame.chromaR  = new Uint8Array(imageBufferR);

            // if (_this.snapshotCanvas !== undefined && 
            //     _this.snapshotCanvas !== null) 
            // {
            //     _this.snapshotCanvas.width = width;
            //     _this.snapshotCanvas.height = height;
            // }

            if (_this.onRender != null) {
                _this.onRender(width, height, imageBufferY, imageBufferB, imageBufferR);
            }
        };

        this.player.onSeekFinish = () => {
            if (this.onSeekFinish != null) this.onSeekFinish();
        };

        /*
         *
         * Start Execute Fetch
         *
         */
        let fetchGetResp = false; // for retry
        let fetchFin = false;
        let fileSize = 0;

        let fetchFuncInner = function(times) {
            setTimeout(function() {
                if (fetchGetResp === false) {
                    
                    controller.abort();
                    controller = null;
                    signal = null;

                    if (times >= def.FETCH_FIRST_MAX_TIMES) {
                        console.warn("stop retry", times);
                        return;
                    }

                    console.warn("start retry", times);

                    controller = new AbortController();
                    signal = controller.signal;
                    let newTimes = times + 1;
                    fetchFuncInner(newTimes);
                }
            }, def.FETCH_HTTP_FLV_TIMEOUT_MS);

            fetch(_this.videoURL, {signal}).then(function(response) {

                console.log(
                    "cnative start fetch", 
                    response, response.headers.get("Content-Length"));
                    // response.status, response.ok
                if (!response.ok) {
                    console.error(
                        "error cdemuxdecoder prepare request media failed with http code:", response.status);
                    return false;
                }

                fetchGetResp = true;
                if (response.headers.has("Content-Length")) {
                    fileSize = response.headers.get("Content-Length");
                    // alert("==========setProbeSize:" + 
                    //     fileSize + ',' + _this.configFormat.extInfo.coreProbePart)
                    if (_this.configFormat.extInfo.coreProbePart <= 0) {
                        _this.player && _this.player.setProbeSize(_this.configFormat.extInfo.probeSize);
                    } else {
                        _this.player && _this.player.setProbeSize(fileSize * _this.configFormat.extInfo.coreProbePart);
                    }
                } else if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) {
                    // @TODO make http-ts here
                    // null is live module LIVE
                    // _this.player && _this.player.setProbeSize(4096);
                    controller.abort();
                    alert("FLV FIND");
                    _this.player.release();
                    _this.player = null;
                    _this._cLiveFLVDecoderEntry(playerConfig);
                    return true;
                } else {
                    // default set 4096
                    _this.player && _this.player.setProbeSize(40960);
                }

                console.log("cnative start fetch", 
                    response.headers.get("Content-Length"), 
                    _this.configFormat.type + _this.mediaExtFormat);
                let pump = function(reader) {
                    console.log("start pump", reader);
                    return reader.read().then(function(result) {
                        if (result.done) {
                            if (probeSuccessed === true) {
                                // alert("========== RESULT DONE ===========");
                                fetchFin = true;
                                // _this.player && _this.player.pushDone();
                                // window.clearInterval(networkInterval);
                                // 一切结束后启动定时器
                                // playInterval = window.setInterval(() => {
                                //     console.log("---------------- loop", new Date());
                                //     readingLoopWithF32();
                                // }, 50);
                            } else {
                                let releaseRet = _this.player.release();
                                console.log("_cDemuxDecoderEntry releaseRet ===> 3 ", releaseRet);
                                _this.player = null;
                                // _this._makeNativePlayer(
                                //     _this.playParam.durationMs, _this.playParam.fps, 
                                //     _this.playParam.sampleRate, _this.playParam.size, 
                                //     false, _this.playParam.videoCodec);
                                if (retry < def.PLAYER_CNATIVE_VOD_RETRY_MAX) {
                                    console.log("retry now _cDemuxDecoderEntry", retry);
                                    retry += 1;
                                    _this._cDemuxDecoderEntry(retry);
                                    return true;
                                } else {
                                    _this._mp4EntryVodStream();
                                    return false;
                                }
                            }
                            return true;
                        }

                        // array buffer
                        let res_arr_buf = result.value.buffer;
                        let chunk = new Uint8Array(result.value.buffer);
                        if (_this.player) {
                            let pushRet = _this.player.pushBuffer(chunk);
                            if (pushRet < 0) {
                                let releaseRet = _this.player.release();
                                console.log("_cDemuxDecoderEntry releaseRet ===> 2 ", releaseRet);
                                _this.player = null;
                                // _this._makeNativePlayer(
                                //     _this.playParam.durationMs, _this.playParam.fps, 
                                //     _this.playParam.sampleRate, _this.playParam.size, 
                                //     false, _this.playParam.videoCodec);
                                if (retry < def.PLAYER_CNATIVE_VOD_RETRY_MAX) {
                                    console.log("retry now _cDemuxDecoderEntry", retry);
                                    retry += 1;
                                    _this._cDemuxDecoderEntry(retry);
                                    return true;
                                } else {
                                    _this._mp4EntryVodStream();
                                    return false;
                                }
                            }
                        }
                        return pump(reader);
                    });
                }; // end pump
                return pump(response.body.getReader());

                // return _this.player.start(
                //     AVCOMMON.ParseGetMediaURL(_this.videoURL));
            }).catch(function(error) {
                if (!error.toString().includes('user aborted')) {
                    console.error("cdemuxdecoder error", error);
                } // end check error
                console.warn("error", error);
                // window.clearInterval(networkInterval);
                return;
            }); // end fetch
        }; // end fetchFuncInner

        fetchFuncInner(0);

    } // _cDemuxDecoderEntry

    _cLiveG711DecoderEntry(playerConfig)
    {
        let _this = this;
        playerConfig.probeSize = this.configFormat.extInfo.probeSize;
        this.player = new CHttpG711Core.CHttpG711Core(playerConfig);
        console.log("_cLiveG711DecoderEntry playerConfig", playerConfig);
        window.g_players[this.player.corePtr] = this.player;
        /*
         *
         * Set Events
         *
         */
        this.player.onProbeFinish = () => { // GetRealDurationOfLastFramePTS(fps, this.mp4Obj.getDurationMs());
            _this.playParam.fps          = _this.player.mediaInfo.fps;
            _this.playParam.durationMs   = -1;

            _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
            // alert("HTTP FLV LIVE");

            _this.playParam.sampleRate   = _this.player.mediaInfo.sampleRate;
            _this.playParam.size = {
                width   : _this.player.mediaInfo.width,
                height  : _this.player.mediaInfo.height
            };
            _this.playParam.audioNone = _this.player.mediaInfo.audioNone;

            console.log("_cLiveG711DecoderEntry _this.player.mediaInfo", _this.player.mediaInfo);

            if (_this.player.vCodecID === def.V_CODEC_NAME_HEVC) {
                if (_this.playParam.audioIdx < 0) {
                    _this.playParam.audioNone = true;
                }
                _this.playParam.videoCodec = def.CODEC_H265;
                _this.onLoadFinish && _this.onLoadFinish();

            } else {
                // need 264 codec, but do not use
                _this.playParam.videoCodec = def.CODEC_H264;
                let releaseRet = _this.player.release();
                console.log("releaseRet ===> ", releaseRet);
                _this.player = null;
                _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone);
            }
            // _this.onLoadFinish && _this.onLoadFinish();
        }; // onProbeFinish

        this.player.onError = (error) => {
            // alert("onError" + error.toString());
            _this.onError && _this.onError(error);
        }; // onError

        this.player.onReadyShowDone = () => {
            _this.configFormat.extInfo.readyShow = false;
            _this.onReadyShowDone && _this.onReadyShowDone();
        }; // onReadyShowDone

        this.player.onLoadCache = () => {
            // this._playerUtilBuildMask(this.configFormat.loadIcon);
            // this._playUtilShowMask();
            if (this.onLoadCache != null) this.onLoadCache();
        }; // onLoadCache

        this.player.onLoadCacheFinshed = () => {
            // this._playUtilHiddenMask();
            if (this.onLoadCacheFinshed != null) this.onLoadCacheFinshed();
        }; // onLoadCacheFinshed

        this.player.onRender = (width, height, imageBufferY, imageBufferB, imageBufferR) => 
        {
            _this.snapshotYuvLastFrame.luma     = null;
            _this.snapshotYuvLastFrame.chromaB  = null;
            _this.snapshotYuvLastFrame.chromaR  = null;

            _this.snapshotYuvLastFrame.width    = width;
            _this.snapshotYuvLastFrame.height   = height;
            _this.snapshotYuvLastFrame.luma     = new Uint8Array(imageBufferY);
            _this.snapshotYuvLastFrame.chromaB  = new Uint8Array(imageBufferB);
            _this.snapshotYuvLastFrame.chromaR  = new Uint8Array(imageBufferR);

            // if (_this.snapshotCanvas !== undefined && 
            //     _this.snapshotCanvas !== null) 
            // {
            //     _this.snapshotCanvas.width = width;
            //     _this.snapshotCanvas.height = height;
            // }

            if (_this.onRender != null) {
                _this.onRender(width, height, imageBufferY, imageBufferB, imageBufferR);
            }
        }; // onRender

        this.player.onPlayState = (status) => {
            _this.onPlayState && _this.onPlayState(status);
        }; // onPlayState

        // boot
        this.player.start(this.videoURL);
        // this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
    } // _cLiveG711DecoderEntry

    _cLiveFLVDecoderEntry(playerConfig)
    {

        // debug start
        // return this._cLiveG711DecoderEntry(playerConfig);
        // debug end

        let _this = this;
        playerConfig.probeSize = this.configFormat.extInfo.probeSize;
        this.player = new CHttpLiveCore.CHttpLiveCore(playerConfig);
        console.log("_cLiveFLVDecoderEntry playerConfig", playerConfig);
        window.g_players[this.player.corePtr] = this.player;
        /*
         *
         * Set Events
         *
         */
        this.player.onProbeFinish = (trans_to_gcore=0) => { // GetRealDurationOfLastFramePTS(fps, this.mp4Obj.getDurationMs());

            if (trans_to_gcore === 1) {
                _this.player.release();
                _this.player = null;
                _this._cLiveG711DecoderEntry(playerConfig);
                return;
            }

            _this.playParam.fps          = _this.player.mediaInfo.fps;
            _this.playParam.durationMs   = -1;

            _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
            // alert("HTTP FLV LIVE");

            _this.playParam.sampleRate   = _this.player.mediaInfo.sampleRate;
            _this.playParam.size = {
                width   : _this.player.mediaInfo.width,
                height  : _this.player.mediaInfo.height
            };
            _this.playParam.audioNone = _this.player.mediaInfo.audioNone;

            console.log("_cLiveFLVDecoderEntry _this.player.mediaInfo", _this.player.mediaInfo);

            if (_this.player.vCodecID === def.V_CODEC_NAME_HEVC) {
                _this.playParam.videoCodec = def.CODEC_H265;
                if (_this.playParam.audioIdx < 0) {
                    _this.playParam.audioNone = true;
                }
                if (AVCOMMON.IsSupport265Mse() === true &&
                    (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV)
                ) {
                    let releaseRet = _this.player.release();
                    console.log("releaseRet 1 to mse 265 ===> ", releaseRet);
                    _this.player = null;

                    if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) {
                        _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone);
                    // } else if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_TS || _this.mediaExtFormat === def.PLAYER_IN_TYPE_MPEGTS) {
                    //     _this._mpegTsNv3rdPlayer(_this.playParam.durationMs, _this.playParam.audioNone);
                    }
                } else {
                    _this.onLoadFinish && _this.onLoadFinish();
                }
            } else {
                // need 264 codec, but do not use
                _this.playParam.videoCodec = def.CODEC_H264;
                let releaseRet = _this.player.release();
                console.log("releaseRet 2 to native 264===> ", releaseRet);
                _this.player = null;

                if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) {
                    _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone);
                } else if (_this.mediaExtFormat === def.PLAYER_IN_TYPE_TS || _this.mediaExtFormat === def.PLAYER_IN_TYPE_MPEGTS) {
                    _this._mpegTsNv3rdPlayer(_this.playParam.durationMs, _this.playParam.audioNone);
                } else {
                    return -1;
                }
            }
            // _this.onLoadFinish && _this.onLoadFinish();
        }; // onProbeFinish

        this.player.onError = (error) => {
            // alert("onError" + error.toString());
            _this.onError && _this.onError(error);
        }; // onError

        this.player.onReadyShowDone = () => {
            _this.configFormat.extInfo.readyShow = false;
            _this.onReadyShowDone && _this.onReadyShowDone();
        }; // onReadyShowDone

        this.player.onLoadCache = () => {
            // this._playerUtilBuildMask(this.configFormat.loadIcon);
            // this._playUtilShowMask();
            if (this.onLoadCache != null) this.onLoadCache();
        }; // onLoadCache

        this.player.onLoadCacheFinshed = () => {
            // this._playUtilHiddenMask();
            if (this.onLoadCacheFinshed != null) this.onLoadCacheFinshed();
        }; // onLoadCacheFinshed

        this.player.onRender = (width, height, imageBufferY, imageBufferB, imageBufferR) => 
        {
            _this.snapshotYuvLastFrame.luma     = null;
            _this.snapshotYuvLastFrame.chromaB  = null;
            _this.snapshotYuvLastFrame.chromaR  = null;

            _this.snapshotYuvLastFrame.width    = width;
            _this.snapshotYuvLastFrame.height   = height;
            _this.snapshotYuvLastFrame.luma     = new Uint8Array(imageBufferY);
            _this.snapshotYuvLastFrame.chromaB  = new Uint8Array(imageBufferB);
            _this.snapshotYuvLastFrame.chromaR  = new Uint8Array(imageBufferR);

            // if (_this.snapshotCanvas !== undefined && 
            //     _this.snapshotCanvas !== null) 
            // {
            //     _this.snapshotCanvas.width = width;
            //     _this.snapshotCanvas.height = height;
            // }

            if (_this.onRender != null) {
                _this.onRender(width, height, imageBufferY, imageBufferB, imageBufferR);
            }
        }; // onRender

        this.player.onPlayState = (status) => {
            _this.onPlayState && _this.onPlayState(status);
        }; // onPlayState

        // boot
        this.player.start(this.videoURL);
        // this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
    } // _cLiveFLVDecoderEntry

    _cWsFLVDecoderEntry() {
        let _this = this;
        let playerConfig = {
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            playerId: this.configFormat.playerId,
            token: this.configFormat.token,
            readyShow: this.configFormat.extInfo.readyShow,
            checkProbe: this.configFormat.extInfo.checkProbe,
            ignoreAudio : this.configFormat.extInfo.ignoreAudio,
            playMode: this.playMode,
            autoPlay: this.configFormat.extInfo.autoPlay,
        };
        playerConfig.probeSize = this.configFormat.extInfo.probeSize;
        this.player = new CWsLiveCore.CWsLiveCore(playerConfig);
        alert("_cWsFLVDecoderEntry probeSize" + playerConfig.probeSize);
        console.log("_cWsFLVDecoderEntry playerConfig", playerConfig);
        window.g_players[this.player.corePtr] = this.player;
        /*
         *
         * Set Events
         *
         */
        this.player.onProbeFinish = () => { // GetRealDurationOfLastFramePTS(fps, this.mp4Obj.getDurationMs());
            _this.playParam.fps          = _this.player.mediaInfo.fps;
            _this.playParam.durationMs   = -1;

            _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
            // alert("HTTP FLV LIVE");

            _this.playParam.sampleRate   = _this.player.mediaInfo.sampleRate;
            _this.playParam.size = {
                width   : _this.player.mediaInfo.width,
                height  : _this.player.mediaInfo.height
            };
            _this.playParam.audioNone = _this.player.mediaInfo.audioNone;

            console.log("_this.player.mediaInfo", _this.player.mediaInfo);

            if (_this.player.vCodecID === def.V_CODEC_NAME_HEVC) {
                if (_this.playParam.audioIdx < 0) {
                    _this.playParam.audioNone = true;
                }
                _this.playParam.videoCodec = def.CODEC_H265;

                if (AVCOMMON.IsSupport265Mse() === true 
                    && _this.mediaExtFormat === def.PLAYER_IN_TYPE_FLV) 
                {
                    let releaseRet = _this.player.release();
                    console.log("releaseRet 1 to mse 265 ===> ", releaseRet);
                    _this.player = null;
                    _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone); // flvjs
                } else {
                    _this.onLoadFinish && _this.onLoadFinish();
                }
                // _this.onLoadFinish && _this.onLoadFinish();
            } else {
                // need 264 codec, but do not use
                _this.playParam.videoCodec = def.CODEC_H264;
                let releaseRet = _this.player.release();
                console.log("releaseRet ===> ", releaseRet);
                _this.player = null;
                _this._flvJsPlayer(_this.playParam.durationMs, _this.playParam.audioNone);
            }
            // _this.onLoadFinish && _this.onLoadFinish();
        }; // onProbeFinish

        this.player.onError = (error) => {
            // alert("onError" + error.toString());
            _this.onError && _this.onError(error);
        }; // onError

        this.player.onReadyShowDone = () => {
            _this.configFormat.extInfo.readyShow = false;
            _this.onReadyShowDone && _this.onReadyShowDone();
        }; // onReadyShowDone

        this.player.onLoadCache = () => {
            // this._playerUtilBuildMask(this.configFormat.loadIcon);
            // this._playUtilShowMask();
            if (this.onLoadCache != null) this.onLoadCache();
        }; // onLoadCache

        this.player.onLoadCacheFinshed = () => {
            // this._playUtilHiddenMask();
            if (this.onLoadCacheFinshed != null) this.onLoadCacheFinshed();
        }; // onLoadCacheFinshed

        this.player.onRender = (width, height, imageBufferY, imageBufferB, imageBufferR) => 
        {
            _this.snapshotYuvLastFrame.luma     = null;
            _this.snapshotYuvLastFrame.chromaB  = null;
            _this.snapshotYuvLastFrame.chromaR  = null;

            _this.snapshotYuvLastFrame.width    = width;
            _this.snapshotYuvLastFrame.height   = height;
            _this.snapshotYuvLastFrame.luma     = new Uint8Array(imageBufferY);
            _this.snapshotYuvLastFrame.chromaB  = new Uint8Array(imageBufferB);
            _this.snapshotYuvLastFrame.chromaR  = new Uint8Array(imageBufferR);

            // if (_this.snapshotCanvas !== undefined && 
            //     _this.snapshotCanvas !== null) 
            // {
            //     _this.snapshotCanvas.width = width;
            //     _this.snapshotCanvas.height = height;
            // }

            if (_this.onRender != null) {
                _this.onRender(width, height, imageBufferY, imageBufferB, imageBufferR);
            }
        }; // onRender

        // boot
        this.player.start(this.videoURL);
        // this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
    } // _cWsFLVDecoderEntry

    _mpegTsEntry() {
        console.log("entry ts");
        let _this = this;

        let avpinit_ret = Module.cwrap("AVPlayerInit", "number", ["string", "string"])(
            this.configFormat.token, '0.0.0'
        );

        let controller = new AbortController();
        let signal = controller.signal;

        this.timerFeed = null;
        this.mpegTsObj = new MpegTSParser.MpegTs();
        this.mpegTsObj.bindReady(_this);

        this.mpegTsObj.onDemuxed = this._mpegTsEntryReady.bind(this);
        this.mpegTsObj.onReady = () => {
            console.log("onReady");
            /*
             * start
             */
            // fetch(_this.videoURL, {signal}).then(res => res.arrayBuffer()).then(streamBuffer => {
            //     if (_this.mpegTsObj === undefined 
            //         || _this.mpegTsObj === null) 
            //     {
            //         controller.abort();
            //         return;
            //     }

            //     streamBuffer.fileStart = 0;
            //     // array buffer to unit8array
            //     let streamUint8Buf = new Uint8Array(streamBuffer);
            //     // console.log(streamUint8Buf);
            //     _this.mpegTsObj.demux(streamUint8Buf);
            // });
            let totalData = null;
            fetch(_this.videoURL, {signal}).then(function(response) {
                if (!response.headers.has("Content-Length")) {
                    // fileSize = response.headers.get("Content-Length");
                    controller.abort();
                    signal = null;
                    controller = null;

                    // _this.player.release();
                    // _this.player = null;

                    let playerConfig = {
                        width: _this.configFormat.playerW,
                        height: _this.configFormat.playerH,
                        playerId: _this.configFormat.playerId,
                        token: _this.configFormat.token,
                        readyShow: _this.configFormat.extInfo.readyShow,
                        checkProbe: _this.configFormat.extInfo.checkProbe,
                        ignoreAudio : _this.configFormat.extInfo.ignoreAudio,
                        playMode: _this.playMode,
                        autoPlay: _this.configFormat.extInfo.autoPlay,
                    };
                    alert("is LIVE ts");
                    _this._cLiveFLVDecoderEntry(playerConfig);

                    return;
                }

                let pump = function(reader) {
                    return reader.read().then(function(result) {
                        if (result.done) {
                            console.log("========== mpegts RESULT DONE ===========");
                            // fetchFinished = true;
                            _this.mpegTsObj.demux(totalData);
                            // window.clearInterval(networkInterval);
                            // networkInterval = null;
                            return;
                        }

                        let chunk = result.value;
                        if (totalData === null) {
                            totalData = chunk;
                        } else {
                            var tmpBuf = chunk;
                            var newLen = totalData.length + tmpBuf.length;
                            var newData = new Uint8Array(newLen);
                            newData.set(totalData);
                            newData.set(tmpBuf, totalData.length);
                            totalData = new Uint8Array(newData);

                            tmpBuf = null;
                            newData = null;
                        }

                        // console.log("call chunk", chunk.length);
                        // rawParser.appendStreamRet(chunk);
                        return pump(reader);
                    });
                }
                return pump(response.body.getReader());
            })
            .catch(function(error) {
                if (!error.toString().includes('user aborted')) {
                    const errMsg = 
                        ' mpegts request error:' + error;
                    console.error(errMsg);
                } // end check error
                
            }); // end fetch

        }; // onReady
        this.mpegTsObj.initMPEG();
    } // _mpegTsEntry

    /**
     * @brief onReadyOBJ is h265webclazz
     */
    _mpegTsEntryReady (onReadyOBJ) {
        let _this = onReadyOBJ;

        let vCodec      = _this.mpegTsObj.getVCodec();
        let aCodec      = _this.mpegTsObj.getACodec();
        let durationMs  = _this.mpegTsObj.getDurationMs();
        let fps         = _this.mpegTsObj.getFPS();
        let sampleRate  = _this.mpegTsObj.getSampleRate();
        let size        = _this.mpegTsObj.getSize();
        console.log("vCodec:", vCodec, "aCodec:", aCodec);

        let isHevcParam = this.mpegTsObj.isHEVC();
        alert(isHevcParam);
        if (!isHevcParam) {
            this.mpegTsObj.releaseTsDemuxer();
            this.mpegTsObj = null;

            this.playParam.durationMs = durationMs;
            this.playParam.fps = fps;
            this.playParam.sampleRate = sampleRate;
            this.playParam.size = size;
            this.playParam.audioNone = aCodec == "";
            this.playParam.videoCodec = isHevcParam ? 0 : 1;
            console.log("this.playParam: ", this.playParam);

            this._mpegTsNv3rdPlayer(this.playParam.durationMs, this.playParam.audioNone);
            // this.onLoadFinish && this.onLoadFinish();

            // this.mpegTsObj
            return;
        }

        _this._makeMP4PlayerViewEvent(durationMs, fps, sampleRate, size, aCodec == "");
        // dur seconds
        let durationSecFloat = durationMs / 1000;
        let durationSec = parseInt(durationSecFloat);

        //TODO: get all the data at once syncronously or feed data through a callback if streamed
        _this._avFeedMP4Data(0, 0);
    } // _mpegTsEntryReady

    /**
     * @brief m3u8
     */
    _m3u8Entry() {
        let _this = this;

        if (this._isSupportWASM() === false) {
            return this._videoJsPlayer();
        }

        let avpinit_ret = Module.cwrap("AVPlayerInit", "number", ["string", "string"])(
            this.configFormat.token, '0.0.0'
        );
        
        let readyFinState = false;
        let durationMs = 0;
        let durationSecFloat;

        this.hlsObj = new M3U8Parser.M3u8();
        this.hlsObj.bindReady(_this);

        // time onFinish -> onDemuxed
        this.hlsObj.onFinished = (readyObj, callFinData) => {
            if (readyFinState == false) {
                // get type duration
                // init player duration
                durationMs  = _this.hlsObj.getDurationMs();
                durationSecFloat = durationMs / 1000;

                _this.hlsConf.hlsType = callFinData.type;
                readyFinState = true;
            } // end if
        };

        this.hlsObj.onCacheProcess = (pts) => {
            if (this.playMode !== def.PLAYER_MODE_NOTIME_LIVE) {
                this.onCacheProcess && this.onCacheProcess(pts);
            }
        };

        this.hlsObj.onDemuxed = (readyObj) => {
            if (_this.player == null) {
                let isHevcParam = _this.hlsObj.isHevcParam;
                let vCodec      = _this.hlsObj.getVCodec(); // h265 h264 hevc
                let aCodec      = _this.hlsObj.getACodec(); // aac mp3
                let fps         = _this.hlsObj.getFPS();
                let sampleRate  = _this.hlsObj.getSampleRate();
                let size        = _this.hlsObj.getSize();
                let channels    = _this.hlsObj.getSampleChannel();
                let audioNone   = false;
                if (channels <= 0) {
                    audioNone = true;
                } else {
                    audioNone = aCodec === "";
                }

                alert("isHevcParam", isHevcParam);

                if (!isHevcParam) {
                    alert("is not hevc hls");
                    // hls release add mpeg release
                    _this.hlsObj.release();
                    if (_this.hlsObj.mpegTsObj) {
                        _this.hlsObj.mpegTsObj.releaseTsDemuxer();
                    }
                    _this.hlsObj = null;

                    _this.playParam.durationMs = durationMs;
                    _this.playParam.fps = fps;
                    _this.playParam.sampleRate = sampleRate;
                    _this.playParam.size = size;
                    _this.playParam.audioNone = aCodec == "";
                    _this.playParam.videoCodec = isHevcParam ? 0 : 1;
                    console.log("this.playParam: ", _this.playParam, durationMs);
                    // _this.onLoadFinish && _this.onLoadFinish();
                    _this._videoJsPlayer(durationMs); // videojs
                    return;
                } // end is hevc

                // console.log("sampleRate: " + sampleRate);
                _this._makeMP4PlayerViewEvent(durationMs, fps, sampleRate, size, audioNone);
            };
        }; // end onDemuxed

        this.hlsObj.onSamples = this._hlsOnSamples.bind(this);

        // start
        this.hlsObj.demux(this.videoURL);

    } // _m3u8Entry end m3u8

    _hlsOnSamples(readyObj, frame) {
        let _this = this;
        // console.warn("===================>this.hlsObj", _this.hlsObj, frame);
        if (frame.video == true) {
            // console.log("FRAME==========>" + frame.pts);
            _this.player.appendHevcFrame(frame);
        } else if (_this.hlsObj.audioNone === false) {
            _this.player.appendAACFrame(frame);
        }

    }; // _hlsOnSamples end onSamples

    // videojs
    _videoJsPlayer(probeDurationMS=-1) {
        let _this = this;
        let playerConfig = {
            probeDurationMS: probeDurationMS,
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            playerId: this.configFormat.playerId,
            ignoreAudio : this.configFormat.extInfo.ignoreAudio,
            autoPlay: this.configFormat.extInfo.autoPlay,
            playMode: this.playMode,
        }; // playerConfig
        this.player = new NvVideoJSCore.NvVideojsCore(playerConfig);
        this.player.onMakeItReady = () => {
            _this.onMakeItReady && _this.onMakeItReady();
        }; // onMakeItReady
        this.player.onLoadFinish = () => {
            alert("_videoJsPlayer onLoadFinish");

            // getSize
            _this.playParam.size = _this.player.getSize();
            _this.playParam.videoCodec = 1; // AVC

            if (_this.player.duration === Infinity || _this.player.duration < 0) {
                _this.playParam.durationMs = -1;
                _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
            } else {
                _this.playParam.durationMs = _this.player.duration * 1000;
                _this.playMode = def.PLAYER_MODE_VOD
            }

            console.log("vjs _this.playParam.", _this.playParam, _this.player.duration, _this.player.getSize());

            _this.onLoadFinish && _this.onLoadFinish();
        }; // onLoadFinish
        this.player.onReadyShowDone = () => {
            _this.onReadyShowDone && _this.onReadyShowDone();
        };
        this.player.onPlayingFinish = () => {
            _this.pause();
            console.log("================> DEBUG this.seek(0)");
            _this.seek(0);

            if (_this.onPlayFinish != null) {
                _this.onPlayFinish();
            }
        }; // onPlayingFinish
        this.player.onPlayingTime = videoPTS => {
            let now = _this._durationText(videoPTS);
            let total = _this._durationText(_this.player.duration);
            // event
            if (_this.onPlayTime != null) _this.onPlayTime(videoPTS);
        }; // onPlayingTime
        this.player.onSeekFinish = () => {
            _this.onSeekFinish && _this.onSeekFinish();
        }; // onSeekFinish
        this.player.onPlayState = (status) => {
            _this.onPlayState && _this.onPlayState(status);
        }; // onPlayState
        this.player.onCacheProcess = (cPts) => {
            _this.onCacheProcess && _this.onCacheProcess(cPts);
        };
        this.player.makeIt(this.videoURL);

    } // _videoJsPlayer

    _flvJsPlayer(durParams=-1, audioNone=false) {
        let _this = this;
        let playerConfig = {
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            playerId: this.configFormat.playerId,
            ignoreAudio : this.configFormat.extInfo.ignoreAudio,
            duration: durParams,
            autoPlay: this.configFormat.extInfo.autoPlay,
            audioNone: audioNone
        }; // playerConfig
        console.log("_flvJsPlayer", playerConfig);
        this.player = new NvFlvJSCore.NvFlvjsCore(playerConfig);
        this.player.onLoadFinish = () => {
            alert("_videoJsPlayer onLoadFinish");

            // getSize
            _this.playParam.size = _this.player.getSize();

            if (!_this.player.duration || _this.player.duration === NaN || _this.player.duration === Infinity || _this.player.duration < 0) {
                _this.playParam.durationMs = -1;
                _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
            } else {
                _this.playParam.durationMs = _this.player.duration * 1000;
                _this.playMode = def.PLAYER_MODE_VOD
            }

            _this.onLoadFinish && _this.onLoadFinish();
        }; // onLoadFinish
        this.player.onReadyShowDone = () => {
            _this.onReadyShowDone && _this.onReadyShowDone();
        }; // onReadyShowDone
        this.player.onPlayingTime = videoPTS => {
            let now = _this._durationText(videoPTS);
            let total = _this._durationText(_this.player.duration);
            // event
            if (_this.onPlayTime != null) _this.onPlayTime(videoPTS);
        }; // onPlayingTime
        this.player.onPlayingFinish = () => {
            _this.pause();
            console.log("================> DEBUG this.seek(0)");
            _this.seek(0);

            if (_this.onPlayFinish != null) {
                _this.onPlayFinish();
            }
        }; // onPlayingFinish
        this.player.onPlayState = (status) => {
            _this.onPlayState && _this.onPlayState(status);
        }; // onPlayState

        this.player.onCacheProcess = (cPts) => {
            _this.onCacheProcess && _this.onCacheProcess(cPts);
        };

        // this.player.onSeekFinish = () => {
        //     _this.onSeekFinish && _this.onSeekFinish();
        // }; // onSeekFinish
        this.player.makeIt(this.videoURL);
    } // _flvJsPlayer

    _mpegTsNv3rdPlayer(durParams=-1, audioNone=false) {
        let _this = this;
        let playerConfig = {
            width: this.configFormat.playerW,
            height: this.configFormat.playerH,
            playerId: this.configFormat.playerId,
            ignoreAudio : this.configFormat.extInfo.ignoreAudio,
            duration: durParams,
            autoPlay: this.configFormat.extInfo.autoPlay,
            audioNone: audioNone
        }; // playerConfig
        console.log("_mpegTsNv3rdPlayer", playerConfig);
        this.player = new NvMpegTsCore.NvMpegTsCore(playerConfig);
        this.player.onLoadFinish = () => {
            alert("_mpegTsNv3rdPlayer onLoadFinish");

            // getSize
            _this.playParam.size = _this.player.getSize();

            if (!_this.player.duration || _this.player.duration === NaN || _this.player.duration === Infinity || _this.player.duration < 0) {
                _this.playParam.durationMs = -1;
                _this.playMode = def.PLAYER_MODE_NOTIME_LIVE;
            } else {
                _this.playParam.durationMs = _this.player.duration * 1000;
                _this.playMode = def.PLAYER_MODE_VOD
            }

            _this.onLoadFinish && _this.onLoadFinish();
        }; // onLoadFinish
        this.player.onReadyShowDone = () => {
            _this.onReadyShowDone && _this.onReadyShowDone();
        }; // onReadyShowDone
        this.player.onPlayingTime = videoPTS => {
            let now = _this._durationText(videoPTS);
            let total = _this._durationText(_this.player.duration);
            // event
            if (_this.onPlayTime != null) _this.onPlayTime(videoPTS);
        }; // onPlayingTime
        this.player.onPlayingFinish = () => {
            _this.pause();
            console.log("================> DEBUG this.seek(0)");
            _this.seek(0);

            if (_this.onPlayFinish != null) {
                _this.onPlayFinish();
            }
        }; // onPlayingFinish
        this.player.onPlayState = (status) => {
            _this.onPlayState && _this.onPlayState(status);
        }; // onPlayState

        this.player.onCacheProcess = (cPts) => {
            _this.onCacheProcess && _this.onCacheProcess(cPts);
        };

        // this.player.onSeekFinish = () => {
        //     _this.onSeekFinish && _this.onSeekFinish();
        // }; // onSeekFinish
        this.player.makeIt(this.videoURL);
    } // _flvJsPlayer

    /**
     * 265流媒体
     */
    _raw265Entry() {
        let _this = this;
        console.log("_raw265Entry", this.videoURL);
        // this.rawParserObj = new RawParser.RawParser();

        let _raw265Entry_createWorkerFetch = function() {
            /*
             * workerFetch
             */
            _this.workerFetch = new Worker(AVCOMMON.GetScriptPath(function() {
                console.log("import raw worker!!!");
                // for fetch
                let controller = new AbortController();
                let signal = controller.signal;
                // for ws
                let WSocket = null;

                function fetchData(url265) {
                    let fetchFinished = false;
                    let startFetch = false;

                    if (!startFetch) {
                        startFetch = true;
                        fetch(url265, {signal}).then(function(response) {
                            let pump = function(reader) {
                                return reader.read().then(function(result) {
                                    if (result.done) {
                                        // console.log("========== RESULT DONE ===========");
                                        fetchFinished = true;
                                        postMessage({
                                            cmd: 'fetch-fin',
                                            data: null, 
                                            msg: 'fetch-fin'
                                        });
                                        // window.clearInterval(networkInterval);
                                        // networkInterval = null;
                                        return;
                                    }

                                    let chunk = result.value;
                                    postMessage({
                                        cmd: 'fetch-chunk',
                                        data: chunk, 
                                        msg: 'fetch-chunk'
                                    });
                                    // rawParser.appendStreamRet(chunk);
                                    return pump(reader);
                                });
                            }
                            return pump(response.body.getReader());
                        })
                        .catch(function(error) {
                            console.log(error);
                        });
                    }
                } // fetchData

                function fetchWs(url265) {
                    WSocket = new WebSocket(url265);
                    WSocket.binaryType = "arraybuffer";

                    WSocket.onopen = function(wsevent) {
                        console.log("Connection open ...");
                        WSocket.send("Hello WebSockets!");
                    };

                    WSocket.onmessage = function(wsevent) {
                        // if(typeof wsevent.data === String) {
                        //     console.log("Received data string");
                        // }
                        if(wsevent.data instanceof ArrayBuffer) {
                            var buffer = wsevent.data;
                            console.log("Received arraybuffer", buffer);

                            if (buffer.byteLength > 0) {
                                postMessage({
                                    cmd: 'fetch-chunk',
                                    data: new Uint8Array(buffer),
                                    msg: 'fetch-chunk'
                                });
                            }

                            // if (totalData === null) {
                            //     totalData = new Uint8Array(buffer);
                            // } else {
                            //     var tmpBuf = new Uint8Array(buffer);
                            //     var newLen = totalData.length + tmpBuf.length;
                            //     var newData = new Uint8Array(newLen);
                            //     newData.set(totalData);
                            //     newData.set(tmpBuf, totalData.length);
                            //     totalData = new Uint8Array(newData);
                            // }
                        }
                    }; // WSocket.onmessage

                    WSocket.onclose = function(wsevent) {
                        console.log("Connection closed.");
                        postMessage({
                            cmd: 'fetch-fin',
                            data: null, 
                            msg: 'fetch-fin'
                        });
                    }; // WSocket.onclose
                } // fetchWs

                onmessage = (event) => {

                    // console.log("worker.onmessage", event);
                    let body = event.data;
                    let cmd = null;
                    if (body.cmd === undefined || body.cmd === null) {
                        cmd = '';
                    } else {
                        cmd = body.cmd;
                    }

                    // console.log("worker recv cmd:", cmd);

                    switch (cmd) {
                        case 'start':
                            // console.log("worker start");
                            let url = body.url;
                            if (body.type === 'http') {
                                fetchData(url);
                            } else if (body.type === 'websocket') {
                                fetchWs(url);
                            }
                            
                            postMessage({
                                cmd: 'default',
                                data: 'WORKER STARTED', 
                                msg: 'default'
                            });
                            break;
                        case 'stop':
                            if (body.type === 'http') {
                                // fetchData(url);
                                controller.abort();
                            } else if (body.type === 'websocket') {
                                WSocket && WSocket.close();
                            }
                            // console.log("worker stop");
                            // postMessage('WORKER STOPPED: ' + body);
                            close(); // Terminates the worker.
                            break;
                        default:
                            // console.log("worker default");
                            // console.log("worker.body -> default: ", body);
                            // worker.postMessage('Unknown command: ' + data.msg);
                            break;
                    };
                };
            })); // end this.workerFetch

            _this.workerFetch.onMsgFetchFinished = false;

            _this.workerFetch.onmessage = function(event) {
                // console.log("play -> workerFetch recv:", event, playerObj);
                let body = event.data;
                let cmd = null;
                if (body.cmd === undefined || body.cmd === null) {
                    cmd = '';
                } else {
                    cmd = body.cmd;
                }

                // console.log("play -> workerFetch recv cmd:", cmd);

                switch (cmd) {
                    case 'fetch-chunk':
                        console.log("play -> workerFetch append chunk");
                        let chunk = body.data;
                        _this.workerParse.postMessage({
                            cmd : "append-chunk",
                            data : chunk,
                            msg : "append-chunk"
                        });
                        break;
                    case 'fetch-fin':
                        _this.workerFetch.onMsgFetchFinished = true;
                        _raw265Entry_naluGetFunc();
                        break;
                    default:
                        break;
                }
            }; // this.workerFetch.onmessage
        }; // _raw265Entry_createWorkerFetch

        let _raw265Entry_createWorkerParse = function() {
            /*
             * workerParse
             */
            _this.workerParse = new Worker(AVCOMMON.GetScriptPath(function() {
                const AfterGetNalThenMvLen  = 3;

                function createRawParserModule() {
                    let obj = new Object();
                    obj.frameList = [];
                    obj.stream = null;

                    obj.frameListEmpty = function() {
                        return obj.frameList.length <= 0;
                    };

                    obj.streamEmpty = function() {
                        return obj.stream === null || obj.stream.length <= 0;
                    };

                    obj.checkEmpty = function() {
                        if (obj.streamEmpty() === true &&
                            obj.frameListEmpty() === true
                        ) {
                            return true;
                        }
                        console.log('checkEmpty', obj.stream, obj.frameList);
                        return false;
                    }; // checkEmpty

                    /*
                     *****************************************************
                     *                                                   *
                     *                                                   *
                     *                     HEVC Frames                   *
                     *                                                   *
                     *                                                   *
                     *****************************************************
                     */
                    obj.pushFrameRet = function (streamPushInput) {
                        if (!streamPushInput || streamPushInput == undefined || streamPushInput == null) {
                            return false;
                        }

                        if (!obj.frameList || obj.frameList == undefined || obj.frameList == null) {
                            obj.frameList = [];
                            obj.frameList.push(streamPushInput);
                            
                        } else {
                            obj.frameList.push(streamPushInput);
                        }

                        return true;
                    }; // pushFrameRet

                    obj.nextFrame = function () {
                        if (!obj.frameList && obj.frameList == undefined || obj.frameList == null && obj.frameList.length < 1) {
                            return null;
                        }
                        return obj.frameList.shift();
                    } // nextFrame

                    obj.clearFrameRet = function () {
                        obj.frameList = null;
                    } // clearFrameRet

                    /*
                     *****************************************************
                     *                                                   *
                     *                                                   *
                     *                     HEVC stream                   *
                     *                                                   *
                     *                                                   *
                     *****************************************************
                     */
                    obj.setStreamRet = function (streamBufInput) {
                        obj.stream = streamBufInput;
                    }; // setStreamRet

                    obj.getStreamRet = function () {
                        return obj.stream;
                    }; // getStreamRet

                    /**
                     * push stream nalu, for live, not vod
                     * @param Uint8Array
                     * @return bool
                     */
                    obj.appendStreamRet = function (input) {
                        if (!input || input === undefined || input == null) {
                            return false;
                        }

                        if (!obj.stream || obj.stream === undefined || obj.stream == null) {
                            obj.stream = input;
                            return true;
                        }

                        let lenOld  = obj.stream.length;
                        let lenPush = input.length;

                        let mergeStream = new Uint8Array(lenOld + lenPush);
                        mergeStream.set(obj.stream, 0);
                        mergeStream.set(input, lenOld);

                        obj.stream = mergeStream;

                        // let retList = obj.nextNaluList(9000);
                        // if (retList !== false && retList.length > 0) {
                        //     obj.frameList.push(...retList);
                        // }

                        for (let i = 0; i < 9999; i++) {
                            let nalBuf = obj.nextNalu();
                            if (nalBuf !== false && nalBuf !== null && nalBuf !== undefined) {
                                obj.frameList.push(nalBuf);
                            } else {
                                break;
                            }
                        }

                        return true;
                    }; // appendStreamRet

                    /**
                     * sub nalu stream, and get Nalu unit
                     */
                    obj.subBuf = function (startOpen, endOpen) { // sub block [m,n]
                        // nal
                        let returnBuf = new Uint8Array(
                            obj.stream.subarray(startOpen, endOpen + 1)
                        );

                        // streamBuf sub
                        obj.stream = new Uint8Array(
                            obj.stream.subarray(endOpen + 1)
                        );

                        return returnBuf;
                    }; // subBuf

                    obj.lastNalu = function() {
                        const nalBuf = obj.subBuf(0, obj.stream.length);
                        obj.frameList.push(nalBuf);
                    };

                    /**
                     * @param onceGetNalCount: once use get nal count, defult 1
                     * @return uint8array OR false
                     */
                    obj.nextNalu = function (onceGetNalCount=1) {

                        // check params
                        if (obj.stream == null || obj.stream.length <= 4) {
                            return false;
                        }

                        // start nal pos
                        let startTag = -1;
                        // return nalBuf
                        let returnNalBuf = null;

                        for (let i = 0;i < obj.stream.length; i++) {
                            if (i + 5 >= obj.stream.length) {
                                return false;
                                // if (startTag == -1) {
                                //     return false;
                                // } else {
                                //     // 如果结尾不到判断的字节位置 就直接全量输出最后一个nal
                                //     returnNalBuf = obj.subBuf(startTag, obj.stream.length-1);
                                //     return returnNalBuf;
                                // }
                            }

                            // find nal
                            if (
                                (   // 0x00 00 01
                                    obj.stream[i]        == 0
                                    && obj.stream[i+1]   == 0
                                    && obj.stream[i+2]   == 1
                                ) || 
                                (   // 0x00 00 00 01
                                    obj.stream[i]        == 0
                                    && obj.stream[i+1]   == 0
                                    && obj.stream[i+2]   == 0
                                    && obj.stream[i+3]   == 1
                                )
                            ) {
                                // console.log(
                                //     "enter find nal , now startTag:" + startTag 
                                //     + ", now pos:" + i
                                // );
                                let nowPos = i;
                                i += AfterGetNalThenMvLen; // 移出去
                                // begin pos
                                if (startTag == -1) {
                                    startTag = nowPos;
                                } else {
                                    if (onceGetNalCount <= 1) {
                                        // startCode - End
                                        // [startTag,nowPos)
                                        // console.log("[===>] last code hex is :" + obj.stream[nowPos-1].toString(16))
                                        returnNalBuf = obj.subBuf(startTag,nowPos-1);
                                        return returnNalBuf;
                                    } else {
                                        onceGetNalCount -= 1;
                                    }
                                }
                            }

                        } // end for

                        return false;
                    }; // nextNalu

                    obj.nextNalu2 = function (onceGetNalCount=1) {
                        // check params
                        if (obj.stream == null || obj.stream.length <= 4) {
                            return false;
                        }

                        // start nal pos
                        let startTag = -1;
                        // return nalBuf
                        let returnNalBuf = null;

                        for (let i = 0;i < obj.stream.length; i++) {
                            if (i + 5 >= obj.stream.length) {
                                if (startTag == -1) {
                                    return false;
                                } else {
                                    // 如果结尾不到判断的字节位置 就直接全量输出最后一个nal
                                    returnNalBuf = obj.subBuf(startTag, obj.stream.length - 1);
                                    return returnNalBuf;
                                }
                            }

                            // find nal
                            let is3BitHeader = obj.stream.slice(i, i+3).join(' ') == '0 0 1';
                            let is4BitHeader = obj.stream.slice(i, i+4).join(' ') == '0 0 0 1';
                            if (
                                is3BitHeader || 
                                is4BitHeader
                            ) {
                                let nowPos = i;
                                i += AfterGetNalThenMvLen; // 移出去
                                // begin pos
                                if (startTag == -1) {
                                    startTag = nowPos;
                                } else {
                                    if (onceGetNalCount <= 1) {
                                        // startCode - End
                                        // [startTag,nowPos)
                                        // console.log("[===>] last code hex is :" + this.stream[nowPos-1].toString(16))
                                        returnNalBuf = obj.subBuf(startTag, nowPos-1);
                                        return returnNalBuf;
                                    } else {
                                        onceGetNalCount -= 1;
                                    }
                                }
                            }

                        } // end for
                        return false;
                    }; // nextNalu2


                    /**
                     * @brief sub nalu stream, and get Nalu unit
                     *          to parse: 
                     *           typedef struct {
                     *               uint32_t width;
                     *               uint32_t height;
                     *               uint8_t *dataY;
                     *               uint8_t *dataChromaB;
                     *               uint8_t *dataChromaR;
                     *           } ImageData;
                     * @params struct_ptr: Module.cwrap('getFrame', 'number', [])
                     * @return Dict
                     */
                    // obj.parseYUVFrameStruct = function (struct_ptr = null) { // sub block [m,n]
                    //     if (struct_ptr == null || !struct_ptr || struct_ptr == undefined) {
                    //         return null;
                    //     }

                    //     let width           = Module.HEAPU32[struct_ptr / 4];
                    //     let height          = Module.HEAPU32[struct_ptr / 4 + 1];
                    //     // let imgBufferPtr    = Module.HEAPU32[ptr / 4 + 2];
                    //     // let imageBuffer     = Module.HEAPU8.subarray(imgBufferPtr, imgBufferPtr + width * height * 3);
                    //     // console.log("width:",width," height:",height);

                    //     let sizeWH          = width * height;
                    //     // let imgBufferYPtr   = Module.HEAPU32[ptr / 4 + 2];
                    //     // let imageBufferY    = Module.HEAPU8.subarray(imgBufferYPtr, imgBufferYPtr + sizeWH);

                    //     // let imgBufferBPtr   = Module.HEAPU32[ptr/4+ 2 + sizeWH/4 + 1];
                    //     // let imageBufferB    = Module.HEAPU8.subarray(
                    //     //     imgBufferBPtr, 
                    //     //     imgBufferBPtr + sizeWH/4
                    //     // );
                    //     // console.log(imageBufferB);

                    //     // let imgBufferRPtr   = Module.HEAPU32[imgBufferBPtr + sizeWH/16 + 1];
                    //     // let imageBufferR    = Module.HEAPU8.subarray(
                    //     //     imgBufferRPtr, 
                    //     //     imgBufferRPtr + sizeWH/4
                    //     // );

                    //     let imgBufferPtr = Module.HEAPU32[struct_ptr / 4 + 1 + 1];

                    //     let imageBufferY = Module.HEAPU8.subarray(imgBufferPtr, imgBufferPtr + sizeWH);

                    //     let imageBufferB = Module.HEAPU8.subarray(
                    //         imgBufferPtr + sizeWH + 8, 
                    //         imgBufferPtr + sizeWH + 8 + sizeWH/4
                    //     );

                    //     let imageBufferR = Module.HEAPU8.subarray(
                    //         imgBufferPtr + sizeWH + 8 + sizeWH/4 + 8,
                    //         imgBufferPtr + sizeWH + 8 + sizeWH/2 + 8
                    //     );

                    //     return {
                    //         width           : width,
                    //         height          : height,
                    //         sizeWH          : sizeWH,
                    //         imageBufferY    : imageBufferY,
                    //         imageBufferB    : imageBufferB,
                    //         imageBufferR    : imageBufferR
                    //     };
                    // }; // parseYUVFrameStruct

                    return obj;
                } // createRawParserModule

                let g_RawParser = createRawParserModule();

                onmessage = (event) => {
                    // console.log("parse - worker.onmessage", event);
                    let body = event.data;
                    let cmd = null;
                    if (body.cmd === undefined || body.cmd === null) {
                        cmd = '';
                    } else {
                        cmd = body.cmd;
                    }

                    // console.log("parse - worker recv cmd:", cmd);

                    switch (cmd) {
                        case 'append-chunk':
                            // console.log("parse - worker append-chunk");
                            let chunk = body.data;
                            g_RawParser.appendStreamRet(chunk);

                            let nalBufRet1 = g_RawParser.nextFrame();
                            postMessage({
                                cmd : "return-nalu",
                                data : nalBufRet1,
                                msg : "return-nalu",
                                parseEmpty : g_RawParser.checkEmpty(),
                                streamEmpty: g_RawParser.streamEmpty(),
                                frameListEmpty: g_RawParser.frameListEmpty(),
                            });
                            break;
                        case 'get-nalu':
                            // let nalBuf = g_RawParser.nextNalu();
                            let nalBufRet2 = g_RawParser.nextFrame();
                            // console.log("parse - worker get-nalu", nalBuf);

                            // if (nalBuf != false) {
                                postMessage({
                                    cmd : "return-nalu",
                                    data : nalBufRet2,
                                    msg : "return-nalu",
                                    parseEmpty : g_RawParser.checkEmpty(),
                                    streamEmpty: g_RawParser.streamEmpty(),
                                    frameListEmpty: g_RawParser.frameListEmpty(),
                                });
                            // }

                            break;
                        case 'last-nalu':
                            let nalBufRet3 = g_RawParser.lastNalu();
                            postMessage({
                                cmd : "return-nalu",
                                data : nalBufRet3,
                                msg : "return-nalu",
                                parseEmpty : g_RawParser.checkEmpty(),
                                streamEmpty: g_RawParser.streamEmpty(),
                                frameListEmpty: g_RawParser.frameListEmpty(),
                            });
                            break;
                        case 'stop':
                            // console.log("parse - worker stop");
                            postMessage('parse - WORKER STOPPED: ' + body);
                            close(); // Terminates the worker.
                            break;
                        default:
                            // console.log("parse - worker default");
                            // console.log("parse - worker.body -> default: ", body);
                            // worker.postMessage('Unknown command: ' + data.msg);
                            break;
                    };
                };
            })); // this.workerParse
            _this.workerParse.stopNaluInterval = false;
            _this.workerParse.parseEmpty = false;
            _this.workerParse.streamEmpty = false;
            _this.workerParse.frameListEmpty = false;

            _this.workerParse.onmessage = event => {
                // return-nalu
                // console.log("play -> workerParse recv:", event, playerObj);
                let body = event.data;
                let cmd = null;
                if (body.cmd === undefined || body.cmd === null) {
                    cmd = '';
                } else {
                    cmd = body.cmd;
                }

                // console.log("play -> workerParse recv cmd:", cmd);

                switch (cmd) {
                    case 'return-nalu':
                        let nalBuf = body.data;
                        let parseEmpty = body.parseEmpty;
                        let streamEmpty = body.streamEmpty;
                        let frameListEmpty = body.frameListEmpty;
                        _this.workerParse.parseEmpty = parseEmpty;
                        _this.workerParse.streamEmpty = streamEmpty;
                        _this.workerParse.frameListEmpty = frameListEmpty;

                        if (nalBuf === false || nalBuf === null || nalBuf === undefined) 
                        {
                            if (_this.workerFetch.onMsgFetchFinished === true && parseEmpty === true)
                            {
                                console.log("set stopNaluInterval");
                                _this.workerParse.stopNaluInterval = true;
                            }
                        } else {
                            // console.warn("play -> workerParse nalu");
                            _this.append265NaluFrame(nalBuf);
                            _this.workerParse.postMessage({
                                cmd : "get-nalu",
                                data : null,
                                msg : "get-nalu"
                            });
                        }
                        break;
                    default:
                        break;
                }
            }; // this.workerParse.onmessage
        }; // _raw265Entry_createWorkerParse

        let _raw265Entry_naluGetFunc = function() {
            setTimeout(() => {
                _this.workerParse.postMessage({
                    cmd : "get-nalu",
                    data : null,
                    msg : "get-nalu"
                });
                console.log("stop _raw265Entry_naluGetFunc check ", 
                    _this.workerParse.parseEmpty, _this.workerFetch.onMsgFetchFinished);

                if (_this.workerFetch.onMsgFetchFinished === true) {
                    // last-nalu
                    if (_this.workerParse.frameListEmpty === true && _this.workerParse.streamEmpty === false) {
                        _this.workerParse.postMessage({
                            cmd : "last-nalu",
                            data : null,
                            msg : "last-nalu"
                        });
                    }
                }

                if (_this.workerParse.parseEmpty === true) {
                    _this.workerParse.stopNaluInterval = true;
                }
                if (_this.workerParse.stopNaluInterval === true) {
                    console.log("stop _raw265Entry_naluGetFunc");
                    return;
                }
                _raw265Entry_naluGetFunc();
            }, 1000);
        }; // _raw265Entry_naluGetFunc

        let _raw265Entry_coverGetFunc = function() {
            setTimeout(() => {
                // 首帧显示渲染
                if (_this.configFormat.extInfo.readyShow) {
                    // candebug = true;
                    console.log("============== readyShow");
                    if (_this.player.cacheYuvBuf.getState() != CACHE_APPEND_STATUS_CODE.NULL) 
                    {
                        _this.player.playFrameYUV(true, true);
                        _this.configFormat.extInfo.readyShow = false;
                        _this.onReadyShowDone && _this.onReadyShowDone();
                        
                    } else {
                        _raw265Entry_coverGetFunc();
                    }
                }
            }, 1000);
        }; // _raw265Entry_coverGetFunc

        /*
         * do
         */
        // this.playParam.durationMs = durationMs;
        // this.playParam.fps = fps;
        // this.playParam.sampleRate = sampleRate;
        // this.playParam.size = size;
        // this.playParam.audioNone = audioNone;
        // this.playParam.videoCodec = videoCodec || def.CODEC_H265;

        // durationMs, fps, sampleRate, size, audioNone=false, videoCodec=null
        this._makeMP4PlayerViewEvent(
            -1, // dur
            this.configFormat.extInfo.rawFps, // fps
            -1, // samplerate
            { // size
                width   : this.configFormat.playerW,
                height  : this.configFormat.playerH
            },
            true, // audioNone
            def.CODEC_H265); // codec
        // feed
        if (this.timerFeed) {
            window.clearInterval(this.timerFeed);
            this.timerFeed = null;
        }

        _raw265Entry_createWorkerFetch();
        _raw265Entry_createWorkerParse();

        alert(AVCOMMON.ParseGetMediaURL(this.videoURL));
        this.workerFetch.postMessage({
            cmd: "start", 
            url: AVCOMMON.ParseGetMediaURL(this.videoURL),
            type: this.mediaExtProtocol, // def.URI_PROTOCOL_HTTP_DESC, 
            msg: "start"
        }); // this.workerFetch.postMessage
        // _raw265Entry_naluGetFunc();
        _raw265Entry_coverGetFunc();
    } // raw265Entry

    // append raw 265 nalu frame
    /**
     * @brief append frame when 265 raw mode
     * @param Uint8Array frame
     * @return
     */
    append265NaluFrame(frame) {
        /*
            nalBuf = frame.data;
            pts = frame.pts;
         */
        let naluPack = {
            data : frame,
            pts : this.rawModePts
        };
        this.player.appendHevcFrame(naluPack);
        // 首帧显示渲染
        if (this.configFormat.extInfo.readyShow) {
            // candebug = true;
            console.log("============== readyShow");
            if (this.player.cacheYuvBuf.getState() != CACHE_APPEND_STATUS_CODE.NULL) {
                this.player.playFrameYUV(true, true);
                this.configFormat.extInfo.readyShow = false;
                this.onReadyShowDone && this.onReadyShowDone();
            }
        }

        this.rawModePts += 1.0 / this.configFormat.extInfo.rawFps;
    } // append265NaluFrame

    /**
     * append 265 raw
     * @param buffer: uint8array
     */
    // append265raw(buffer) {
    //     if (this.rawParserObj && buffer) {
    //         return this.rawParserObj.appendStreamRet(buffer);
    //     }
    //     return false;
    // }

}

exports.H265webjs = H265webjsModule;
global.new265webjs = (videoURL, config) => {
    let webjs = new H265webjsModule(videoURL, config);
    return webjs;
};




