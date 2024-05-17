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
// const def = require('./consts');
// const RenderEngine420P = require('./webgl420');

// const Module      = require('./missile.js');
const BUFF_FRAME    = require('../demuxer/bufferFrame');
const BUFFMOD       = require('../demuxer/buffer');
const CacheYUV      = require('./cache');
const CacheYUVStruct= require('./cacheYuv');

const RenderEngine420P  = require('../render-engine/webgl-420p');
const AVCommon          = require('./av-common');
const AudioEnginePCM    = require('./audio-native-core');
const AudioModule       = require('./audio-core');
const def           = require('../consts');
const VersionModule = require('../version');

// mem
const AU_FMT_READ                       = 10;
const MISSILE_PKT_GET_TYPE_AAC          = 100;
const MISSILE_PKT_GET_TYPE_HAVE_VIDEO   = 200;
const MISSILE_PKT_GET_TYPE_YUV          = 300;
const MISSILE_PKT_GET_NOTHING           = 404;
const MISSILE_PKT_GET_SPLIT_FINISHED    = 405;

const READY_PUSH_COUNT_LIMIT            = 0;

const HTTP_FLV_CACHE_V_OK_COUNT           = 25;
const HTTP_FLV_CACHE_A_OK_COUNT           = 50;

const PLAY_LOOP_COST_ONCE_TOTAL         = 100; // 100 loop compute once

const PLAY_LOOP_RESET_CORRECT_DUR_MS    = 1; // 1ms

const V_CACHE_INTERVAL_WAIT_LOOP_MS = 10;
const V_CACHE_INTERVAL_PUSH_LOOP_MS = 1;

// function getScriptPath(foo) {
//     let fooStr = foo.toString();
//     let fooMatchFunc = fooStr.match(/^\s*function\s*\(\s*\)\s*\{(([\s\S](?!\}$))*[\s\S])/);

//     console.log(fooStr);
//     console.log(fooMatchFunc);

//     let funcStream = [fooMatchFunc[1]];
//     return window.URL.createObjectURL(
//         new Blob(
//             funcStream, 
//             {
//                 type: 'text/javascript'
//             }
//         )
//     ); 
// }

class CHttpLiveCoreModule { // export default 
    constructor(config) {
        let _this = this;
        this.config = {
            width: config.width || def.DEFAULT_WIDTH,
            height: config.height || def.DEFAULT_HEIGHT,
            fps: config.fps || def.DEFAULT_FPS,
            sampleRate: config.sampleRate || def.DEFAULT_SAMPLERATE,
            playerId: config.playerId || def.DEFAILT_WEBGL_PLAY_ID,
            token: config.token || null,
            probeSize: config.probeSize || 4096,
            ignoreAudio : config.ignoreAudio || 0,
            autoPlay: config.autoPlay || false,
        }; // end this.config
        console.log("this.config", this.config);

        alert("this.config.probeSize" + this.config.probeSize + " ignoreAudio:" + this.config.ignoreAudio);

        this.mediaInfo = {
            noFPS : false,
            fps : def.DEFAULT_FPS,
            width : this.config.width,
            height : this.config.height,
            sampleRate : this.config.sampleRate,
            size : {
                width : -1,
                height : -1,
            },
            audioNone : false,
        }; // end mediaInfo
        this.duration = -1;
        this.vCodecID = def.V_CODEC_NAME_HEVC;

        this.corePtr = null;
        this.AVGetInterval = null;
        this.AVDecodeInterval = null;
        this.decVFrameInterval = null;

        this.readyShowDone = false;
        this.readyKeyFrame = false;
        // this.ready_now = 0; // undo
        this.cache_status = false; // is have cache
        this.download_length = 0;

        this.AVGLObj = null;
        this.canvasBox = document.querySelector('#' + this.config.playerId);
        this.canvasBox.style.overflow = "hidden"; // 多于的像素不显示
        // this.CanvasObj = document.querySelector("#canvas");
        this.CanvasObj = null;
        this.CanvasObj = document.createElement('canvas');
        this.CanvasObj.style.width = this.canvasBox.clientWidth + 'px';
        this.CanvasObj.style.height = this.canvasBox.clientHeight + 'px';
        this.CanvasObj.style.top = '0px';
        this.CanvasObj.style.left = '0px';
        this.canvasBox.appendChild(this.CanvasObj);

        this.audioWAudio= null; // web audio aac decoder player
        this.audioVoice = 1.0;

        this.isCacheV = def.CACHE_NO_LOADCACHE;

        this.muted = this.config.autoPlay; // for autoplay
        if (this.config.autoPlay === true && this.config.ignoreAudio < 1)
        {
            window.onclick = document.body.onclick = function(e) {
                _this.muted = false;
                console.log("window onclick _reinitAudioModule");
                _this._reinitAudioModule(_this.mediaInfo.sampleRate);

                if (_this.isPlayingState() === true) {
                    _this.pause();
                    _this.play();
                }

                window.onclick = document.body.onclick = null;
            };
        }

        this.frameTimeSec = 1.0 / this.config.fps;
        this.frameTime = 1000 * this.frameTimeSec;

        this.NaluBuf = [];
        this.YuvBuf = [];
        // this.AACBuf = [];

        this.getPackageTimeMS = 0;

        this.workerFetch = null;
        this.playInterval = null;

        /*
         * ptr func
         */
        this._ptr_probeCallback = null;
        this._ptr_frameCallback = null;
        this._ptr_naluCallback = null;
        this._ptr_sampleCallback = null;
        this._ptr_aacCallback = null;

        // fetch worker
        // console.warn("_this before corePtr:", _this);

        this.totalLen = 0;
        this.pushPkg = 0;
        this.showScreen = false;

        // events
        this.onProbeFinish      = null;
        // this.onPlayingTime      = null;
        // this.onPlayingFinish    = null;
        // this.loadCacheStatus    = false;
        this.onLoadCache        = null;
        this.onLoadCacheFinshed = null;
        this.onRender           = null;
        // this.onCacheProcess     = null;
        this.onReadyShowDone    = null;
        this.onError            = null;
        this.onPlayState        = null;

        // run
        // const TOKEN_SECRET = "base64:QXV0aG9yOmNoYW5neWFubG9uZ3xudW1iZXJ3b2xmLEdpdGh1YjpodHRwczovL2dpdGh1Yi5jb20vbnVtYmVyd29sZixFbWFpbDpwb3JzY2hlZ3QyM0Bmb3htYWlsLmNvbSxRUTo1MzEzNjU4NzIsSG9tZVBhZ2U6aHR0cDovL3h2aWRlby52aWRlbyxEaXNjb3JkOm51bWJlcndvbGYjODY5NCx3ZWNoYXI6bnVtYmVyd29sZjExLEJlaWppbmcsV29ya0luOkJhaWR1";
        this.corePtr = Module.cwrap("AVSniffHttpFlvInit", "number", ["string", "string"])(
            this.config.token, '0.0.0'
        );
        console.log("wasmHttpFLVLoaded!!", this.corePtr);

    } // end func constructor

    // _eventLoadCache() {
    //     this.onLoadCache && this.onLoadCache();
    // }

    // _eventLoadCacheFinished() {
    //     this.onLoadCacheFinshed && this.onLoadCacheFinshed();
    // }

    _workerFetch_onmessage(event, _this) {
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
            case 'startok':
                alert("startok");
                _this.getPackageTimeMS = AVCommon.GetMsTime();
                // /*
                if (_this.AVGetInterval === undefined 
                    || _this.AVGetInterval === null) 
                {
                    _this.AVGetInterval = window.setInterval(function() {
                        let bufLen = Module.cwrap("getBufferLengthApi", "number", ["number"])(_this.corePtr);
                        // console.log("play -> workerFetch last buf len: ", bufLen);
                        if (bufLen > _this.config.probeSize) {
                        // if (pushPkg > READY_PUSH_COUNT_LIMIT) {
                            let get_ret = Module.cwrap("getSniffHttpFlvPkg", "number", ["number"])(_this.corePtr);
                            // console.log("play -> workerFetch get nalu ret: ", get_ret, _this.pushPkg);
                            _this.pushPkg -= 1;
                            // _this.ready_now = 1;
                        // }
                        } else {
                            if (_this.getPackageTimeMS > 0 &&
                                AVCommon.GetMsTime() - _this.getPackageTimeMS >= def.FETCH_HTTP_FLV_TIMEOUT_MS
                            ) {
                                console.warn("retry!");
                                _this.getPackageTimeMS = AVCommon.GetMsTime();
                                _this.workerFetch.postMessage({
                                    cmd: 'retry',
                                    data: null,
                                    msg: 'retry'
                                });
                            }
                        } // end if buf len check
                    }, 5);
                } // end if AVGetInterval
                break;
            case 'fetch-chunk':
                //console.log("play -> workerFetch append chunk");
                let chunk = body.data;
                _this.download_length += chunk.length;

                let push_ret = 0;
                setTimeout(function() {
                    let offset_video = Module._malloc(chunk.length);
                    Module.HEAP8.set(chunk, offset_video);

                    // console.warn("_this.corePtr:", _this);
                    push_ret = Module.cwrap("pushSniffHttpFlvData", "number", ["number", "number", "number", "number"])(
                        _this.corePtr, offset_video, chunk.length, _this.config.probeSize
                    );
                    // console.warn("pushRet:", push_ret);

                    Module._free(offset_video);
                    offset_video = null;
                }, 0); // end setTimeout

                _this.totalLen += chunk.length;
                //console.log("play -> workerFetch append chunk ret: ", push_ret, chunk.length, totalLen);
                if (chunk.length > 0) {
                    _this.getPackageTimeMS = AVCommon.GetMsTime();
                }
                _this.pushPkg++;

                // // /*
                // if (_this.AVGetInterval === undefined 
                //     || _this.AVGetInterval === null) 
                // {
                //     _this.AVGetInterval = window.setInterval(function() {
                //         let bufLen = Module.cwrap("getBufferLengthApi", "number", ["number"])(_this.corePtr);
                //         // console.log("play -> workerFetch last buf len: ", bufLen);
                //         if (bufLen > _this.config.probeSize) {
                //         // if (pushPkg > READY_PUSH_COUNT_LIMIT) {
                //             let get_ret = Module.cwrap("getSniffHttpFlvPkg", "number", ["number"])(_this.corePtr);
                //             // console.log("play -> workerFetch get nalu ret: ", get_ret, _this.pushPkg);
                //             _this.pushPkg -= 1;
                //             // _this.ready_now = 1;
                //         // }
                //         } else {
                //             if (_this.getPackageTimeMS > 0 &&
                //                 AVCommon.GetMsTime() - _this.getPackageTimeMS >= def.FETCH_HTTP_FLV_TIMEOUT_MS
                //             ) {
                //                 console.warn("retry!");
                //                 _this.getPackageTimeMS = AVCommon.GetMsTime();
                //                 _this.workerFetch.postMessage({
                //                     cmd: 'retry',
                //                     data: null,
                //                     msg: 'retry'
                //                 });
                //             }
                //         } // end if buf len check
                //     }, 5);
                // } // end if AVGetInterval
                break;
            case 'close':
                _this.AVGetInterval && clearInterval(_this.AVGetInterval);
                _this.AVGetInterval = null;
                break;
            case 'fetch-fin':
                // fetchFinished = true;
                /*
                if (AVGetInterval !== undefined || AVGetInterval !== null) {
                    console.log(" OVER========================>", AVGetInterval);
                    window.clearInterval(AVGetInterval);
                    AVGetInterval = null;
                }
                */
                break;
            case 'fetch-error':
                _this.onError && _this.onError(body.data);
            default:
                break;
        } // end switch
    } // end function _workerFetch_onmessage

    _checkDisplaySize(realW, widthIn, heightIn) {
        let align = widthIn - realW;
        let confWwithAlign = (this.config.width + Math.ceil(align / 2.0)); // 有些内存对齐的像素 需要挤出去 @todo 以后用gl解决

        //console.log("checkDisplaySize==========>", widthIn, heightIn);
        let biggerWidth = widthIn / this.config.width > heightIn / this.config.height;

        let fixedWidth = (confWwithAlign / widthIn).toFixed(2);
        let fixedHeight = (this.config.height / heightIn).toFixed(2);

        // let fixedWidth = (Math.ceil((confWwithAlign / widthIn) * 100) / 100).toFixed(2);
        // let fixedHeight = (Math.ceil((this.config.height / heightIn) * 100) / 100).toFixed(2);

        let scaleRatio = biggerWidth ? fixedWidth : fixedHeight;
        let isFixed = this.config.fixed;
        let width = isFixed ? confWwithAlign : parseInt(widthIn  * scaleRatio);
        let height = isFixed ? this.config.height : parseInt(heightIn * scaleRatio);
        // let width = isFixed ? confWwithAlign : parseInt(Math.ceil(widthIn  * scaleRatio));
        // let height = isFixed ? this.config.height : parseInt(Math.ceil(heightIn * scaleRatio));

        if (this.CanvasObj.offsetWidth != width || this.CanvasObj.offsetHeight != height) {
            let topMargin = parseInt((this.canvasBox.offsetHeight - height) / 2);
            let leftMargin = parseInt((this.canvasBox.offsetWidth - width) / 2);
            topMargin = topMargin < 0 ? 0 : topMargin;
            leftMargin = leftMargin < 0 ? 0 : leftMargin;
            //console.log(topMargin, leftMargin);
            this.CanvasObj.style.marginTop = topMargin + 'px';
            this.CanvasObj.style.marginLeft = leftMargin + 'px';
            this.CanvasObj.style.width = width + 'px';
            this.CanvasObj.style.height = height + 'px';
        }
        this.isCheckDisplay = true;
        return [width, height];
    }

    _ptsFixed2(pts) {
        return Math.ceil(pts * 100.0) / 100.0;
    }

    _reinitAudioModule(sampleRate=44100) {
        if (this.config.ignoreAudio > 0) {
            return;
        }
        let _this = this;
        if (undefined !== this.audioWAudio && null !== this.audioWAudio) {
            this.audioWAudio.stop();
            this.audioWAudio = null;
        }

        this.audioWAudio = AudioModule({
            sampleRate: sampleRate,
            appendType: def.APPEND_TYPE_FRAME
        }); // this.audioWAudio
        this.audioWAudio.isLIVE = true;
    } // _createAudioModule

    // callback
    _callbackProbe(duration, width, height, fps,
        audioIdx,
        sample_rate, channels, vcodec_name_id, sample_fmt, trans_to_gcore=0) 
    {

        if (trans_to_gcore === 1) {
            this.onProbeFinish && this.onProbeFinish(trans_to_gcore);
            return;
        }

        const hex = Module.HEAPU8.subarray(sample_fmt, sample_fmt + AU_FMT_READ);
        let sample_fmt_str = "";
        for (let i = 0; i < hex.length; i++) {
            let char = String.fromCharCode(hex[i]);
            sample_fmt_str += char;
        }
        console.log("callbackProbe", duration, width, height, fps,
            audioIdx,
            sample_rate, channels, vcodec_name_id, sample_fmt_str);

        let retFPS = fps;
        if (fps > 100) {
            retFPS = def.DEFAULT_FPS;
            this.mediaInfo.noFPS = true;
        }

        this.vCodecID = vcodec_name_id;
        this.config.fps = retFPS;
        this.mediaInfo.fps = retFPS;
        this.mediaInfo.size.width = width;
        this.mediaInfo.size.height = height;

        this.frameTime = Math.floor(1000.0 / (this.mediaInfo.fps + 5));

        this.chaseFrame = 0;

        // check canvas width/height
        if (this.CanvasObj.width != width || this.CanvasObj.height != height) {
            this.CanvasObj.width = width;
            this.CanvasObj.height = height;

            if (!this.isCheckDisplay) { // resize by callback
                // let displayWH = this._checkDisplaySize(width, height);
                let displayWH = this._checkDisplaySize(width, width, height);
            }
        } // end set canvas size

        if (audioIdx >= 0 && this.mediaInfo.noFPS === false)
        {
            this.config.sampleRate = sample_rate;
            this.mediaInfo.sampleRate = sample_rate;

            // if (undefined !== this.audioWAudio && null !== this.audioWAudio) {
            //     this.audioWAudio.stop();
            //     this.audioWAudio = null;
            // }

            // console.log("create audio = ignoreAudio:", this.config.ignoreAudio < 1);
            // this.audioWAudio = AudioModule({
            //     sampleRate: this.mediaInfo.sampleRate,
            //     appendType: def.APPEND_TYPE_FRAME
            // }); // this.audioWAudio
            // this.audioWAudio.isLIVE = true;

            if (this.config.ignoreAudio < 1 && this.muted === false) {
                this._reinitAudioModule(this.mediaInfo.sampleRate);
            }
            // this.audioWAudio.setDurationMs(duration * 1000.0);
        } else {
            this.mediaInfo.audioNone = true;
        } // end audioIdx

        this.onProbeFinish && this.onProbeFinish();

        // this.play();
    } // end func _callbackProbe

    _callbackYUV(y, u, v, line_y, line_u, line_v, w, h, pts, tag) 
    {
        let _this = this;
        console.log("callbackYUV==============>", line_y, line_u, line_v, w, h, pts, tag);

        let offsetY = Module.HEAPU8.subarray(y, y + line_y * h);
        let bufY = new Uint8Array(offsetY);

        let offsetU = Module.HEAPU8.subarray(u, u + line_u * h / 2);
        let bufU = new Uint8Array(offsetU);

        let offsetV = Module.HEAPU8.subarray(v, v + line_v * h / 2);
        let bufV = new Uint8Array(offsetV);

        let data = {
            //AVGLObj: AVGLObj,
            bufY: bufY,
            bufU: bufU,
            bufV: bufV,
            line_y: line_y,
            h: h,
            pts: pts,
        }; // data

        this.YuvBuf.push(data);
        console.log(
            "callbackYUV==============> YuvBuf length", this.YuvBuf.length);

        this.checkCacheState();

        // if (this.checkCacheState() === false) {
        //     console.log("YUV cache finished");
        //     this.cache_status = 0;
        //     this.audioWAudio.play();
        // } // check cache

        //renderFrame(AVGLObj, bufY, bufU, bufV, line_y, h);
        /*
        workerGL.postMessage({
            cmd: "start", 
            data: {
                AVGLObj: AVGLObj,
                bufY: bufY,
                bufU: bufU,
                bufV: bufV,
                line_y: line_y,
                h: h
            },
            msg: "start"
        });*/

        Module._free(offsetY);
        offsetY = null;
        Module._free(offsetU);
        offsetU = null;
        Module._free(offsetV);
        offsetV = null;

        if (this.readyShowDone === false && this.playYUV() === true) {
            this.readyShowDone = true;
            this.onReadyShowDone && this.onReadyShowDone();
            if (!this.audioWAudio && 
                this.config.autoPlay === true) 
            {
                this.play();
                setTimeout(function() {
                    console.log("isPlayingState", _this.isPlayingState());
                }, 3000);
            }
        } // this.readyShowDone

        //bufY = null;
        //bufU = null;
        //bufV = null;
    } // end func _callbackYUV

    _callbackNALU(data, len, isKey, w, h, pts, dts) 
    {
        //return;
        // console.log("callbackNALU len", len);
        // console.log("callbackNALU is key", isKey);
        // console.log("callbackNALU w h", w, h);
        // console.log("callbackNALU time HEVC dts", dts);

        if (this.readyKeyFrame === false) {
            if (isKey <= 0) {
                return;
            } else {
                this.readyKeyFrame = true;
            }
        }

        let offsetFrame = Module.HEAPU8.subarray(data, data + len);
        let bufData = new Uint8Array(offsetFrame);
        //console.log("callbackNALU Data:", bufData);
        this.NaluBuf.push({
            bufData: bufData,
            len: len,
            isKey: isKey,
            w: w,
            h: h,
            pts: pts * 1000,
            dts: dts * 1000
        }); 

        /*
        let offset_video = Module._malloc(bufData.length);
        Module.HEAP8.set(bufData, offset_video);

        // decode start
        let decRet = Module.cwrap("decodeVideoFrame", "number", 
            ["number", "number", "number", "number", "number"])
            (corePtr, offset_video, bufData.length, pts, dts, 0);
        console.log("decodeVideoFrame ret:", decRet); 
        // decode end

        */
        //bufData = null;
        Module._free(offsetFrame);
        offsetFrame = null;
        //Module._free(offset_video);
        //offset_video = null;
    } // end func _callbackNALU

    _callbackPCM(pcm) {
        if (this.config.ignoreAudio > 0) {
            return;
        }
    } // end func _callbackPCM

    // _callbackAAC(adts, buffer, line1, channel, pts) {
    _callbackAAC(aacFrame, line1, channel, pts) {
        console.log("callbackAAC time AAC dts", pts);
        if (this.config.ignoreAudio > 0) {
            return;
        }

        let ptsFixed = this._ptsFixed2(pts);
        if (this.audioWAudio && this.muted === false) 
        {
            console.log("_reinitAudioModule callbackaac");
            // let pcmFrame = new Uint8Array(7 + line1);
            // let adts_buf = Module.HEAPU8.subarray(adts, adts + 7);
            // pcmFrame.set(adts_buf, 0);
            // // let adts_out = new Uint8Array(adts_buf);
            // let aac_buf = Module.HEAPU8.subarray(buffer, buffer + line1);
            // pcmFrame.set(aac_buf, 7);

            let pcmFrameABuf = Module.HEAPU8.subarray(aacFrame, aacFrame + line1);
            let pcmFrame = new Uint8Array(pcmFrameABuf);

            let aacData = {
                pts : ptsFixed,
                data : pcmFrame,
            }; // aacData

            // this.AACBuf.push(aacData);
            this.audioWAudio.addSample(aacData);
            // console.log("callbackNALU time AAC queue len", 
            //     this.audioWAudio.sampleQueue.length);
            // this.bufLastADTS = Math.max(ptsFixed, this.bufLastADTS);

            this.checkCacheState();

            // let aac_buf_out = new Uint8Array(aac_buf);

            // console.log("_aacFrameCallback============>", pcmFrame, pts);
            // let sampleObject = {
            //  data: pcmFrame, 
            //  pts: pts
            // };
            // this.aCachePTS = Math.max(ptsFixed, this.aCachePTS);
            // this.onCacheProcess && this.onCacheProcess(this.getCachePTS());
            // this.audioWAudio.addSample(sampleObject);
        }
    } // end func _callbackPCM

    _decode(loopMs=V_CACHE_INTERVAL_PUSH_LOOP_MS) {
        let _this = this;

        setTimeout(() => {
            if (_this.workerFetch === null) {
                return;
            }
            // if (_this.cache_status === false || _this.YuvBuf.length < 5) 
            // {
                let item = _this.NaluBuf.shift();
                if (item !== undefined && item !== null) {

                    let offset_video = Module._malloc(item.bufData.length);
                    Module.HEAP8.set(item.bufData, offset_video);

                    // decode start
                    // let debugStartMS = AVCommon.GetMsTime();
                    let decRet = Module.cwrap("decodeHttpFlvVideoFrame", "number",
                        ["number", "number", "number", "number", "number"])
                        (_this.corePtr, offset_video, item.bufData.length, item.pts, item.dts, 0);
                    //console.log("decodeVideoFrame ret:", decRet); 
                    // let debugEndMS = AVCommon.GetMsTime();

                    // console.log("js debug callbackYUV==============> time:", 
                        // debugEndMS, "-", debugStartMS, "=", debugEndMS - debugStartMS);
                    // decode end

                    //item.bufData = null;
                    Module._free(offset_video);
                    offset_video = null;
                }
            // }

            _this._decode();
        }, 1); // end timeout

        // console.log("loopMs=>", loopMs);

        // if (this.AVDecodeInterval !== undefined 
        //     && this.AVDecodeInterval !== null) {
        //     window.clearInterval(this.AVDecodeInterval);
        //     this.AVDecodeInterval = null;
        // }

        // this.AVDecodeInterval = setInterval(function() {
        //     if (_this.cache_status === false) {
        //         if (loopMs > V_CACHE_INTERVAL_PUSH_LOOP_MS) {
        //             _this._decode();
        //             return;
        //         }
        //     } else {
        //         if (loopMs < V_CACHE_INTERVAL_WAIT_LOOP_MS) {
        //             _this._decode(V_CACHE_INTERVAL_WAIT_LOOP_MS);
        //             return;
        //         }
        //     }

        //     if (_this.NaluBuf.length > 0) {
        //         let item = _this.NaluBuf.shift();

        //         let offset_video = Module._malloc(item.bufData.length);
        //         Module.HEAP8.set(item.bufData, offset_video);

        //         // decode start
        //         let decRet = Module.cwrap("decodeHttpFlvVideoFrame", "number",
        //             ["number", "number", "number", "number", "number"])
        //             (_this.corePtr, offset_video, item.bufData.length, item.pts, item.dts, 0);
        //         console.log("decodeVideoFrame ret:", decRet); 
        //         // decode end

        //         //item.bufData = null;
        //         Module._free(offset_video);
        //         offset_video = null;
        //     } else {
        //         // console.log("decodeVideoFrame nalu empty:", _this.NaluBuf.length); 
        //     }
        // }, loopMs); // end this.AVDecodeInterval
    } // end func _decode

    setScreen(setVal = false) {
        this.showScreen = setVal;
        // if (this.canvas) {
        //     if (setVal) {
        //         this.canvas.setAttribute('hidden', true);
        //     } else {
        //         this.canvas.removeAttribute('hidden');
        //     }
        // }
    }

    checkCacheState() {
        console.log("checkCacheState ", 
            this.YuvBuf.length, HTTP_FLV_CACHE_V_OK_COUNT, 
            (
                this.config.ignoreAudio > 0 || 
                this.mediaInfo.audioNone === true || 
                (
                    this.audioWAudio && 
                    this.audioWAudio.sampleQueue.length >= HTTP_FLV_CACHE_A_OK_COUNT
                )
            )
        );
        let newState = (
            this.YuvBuf.length >= HTTP_FLV_CACHE_V_OK_COUNT 
            && (this.muted === true ||
                this.config.ignoreAudio > 0 || this.mediaInfo.audioNone === true || 
                (this.audioWAudio && this.audioWAudio.sampleQueue.length >= HTTP_FLV_CACHE_A_OK_COUNT)
            )
        );
        if (this.cache_status === false && newState) {
            console.log("let audioModule new play");
            if (this.playInterval && this.audioWAudio) this.audioWAudio.play();
            this.onLoadCacheFinshed && this.onLoadCacheFinshed();
            this.cache_status = true;
            // return true;
        }
        return newState; // keep
    }

    setVoice(voice) {
        if (this.config.ignoreAudio < 1) {
            this.audioVoice = voice;
            this.audioWAudio && this.audioWAudio.setVoice(voice);
        }
    }

    _removeBindFuncPtr() {
        if (this._ptr_probeCallback !== null) 
            Module.removeFunction(this._ptr_probeCallback);
        if (this._ptr_frameCallback !== null) 
            Module.removeFunction(this._ptr_frameCallback);
        if (this._ptr_naluCallback !== null) 
            Module.removeFunction(this._ptr_naluCallback);
        if (this._ptr_sampleCallback !== null) 
            Module.removeFunction(this._ptr_sampleCallback);
        if (this._ptr_aacCallback !== null) 
            Module.removeFunction(this._ptr_aacCallback);

        this._ptr_probeCallback = null;
        this._ptr_frameCallback = null;
        this._ptr_naluCallback = null;
        this._ptr_sampleCallback = null;
        this._ptr_aacCallback = null;
    }

    release() {
        this.pause();
        // @todo
        this.NaluBuf.length = 0;
        this.YuvBuf.length = 0;

        if (this.workerFetch !== undefined && this.workerFetch !== null) {
            this.workerFetch.postMessage({
                cmd: 'stop',
                data: 'stop', 
                msg: 'stop'
            });
        }
        this.workerFetch = null;

        this.AVGetInterval && clearInterval(this.AVGetInterval);
        this.AVGetInterval = null;

        this._removeBindFuncPtr();
        if (this.corePtr !== undefined && this.corePtr !== null) {
            let releaseRet = Module.cwrap(
                'releaseHttpFLV', 'number', ['number'])(this.corePtr);
        }

        this.playInterval && clearInterval(this.playInterval);
        this.playInterval = null;

        this.audioWAudio && this.audioWAudio.stop();
        this.audioWAudio = null;

        if (this.AVGLObj !== undefined && this.AVGLObj !== null) {
            RenderEngine420P.releaseContext(this.AVGLObj);
            this.AVGLObj = null;
        }

        this.CanvasObj && this.CanvasObj.remove();
        this.CanvasObj = null;

        window.onclick = document.body.onclick = null;
        delete window.g_players[this.corePtr];

        return 0;
    }

    isPlayingState() {
        return this.playInterval !== null && this.playInterval !== undefined;
    }

    pause() {
        console.log("audio pause prepare:", this.config.ignoreAudio, this.audioWAudio);
        if (this.config.ignoreAudio < 1) {
            console.log("audio pause start");
            this.audioWAudio && this.audioWAudio.pause();
        }
        this.playInterval && clearInterval(this.playInterval);
        this.playInterval = null;
        this.chaseFrame = 0;

        this.onPlayState && this.onPlayState(this.isPlayingState());
    }

    playYUV() {
        if (this.YuvBuf.length > 0) {
            let item = this.YuvBuf.shift();
            this.onRender && this.onRender(
                item.line_y, item.h, 
                item.bufY, item.bufU, item.bufV);
            RenderEngine420P.renderFrame(this.AVGLObj, 
                                item.bufY, item.bufU, item.bufV, 
                                item.line_y, item.h);
            return true;
        }

        return false;
    }

    play() {
        let _this = this;
        this.chaseFrame = 0;

        if (false === this.checkCacheState()) {
            this.onLoadCache && this.onLoadCache();
            setTimeout(() => {
                console.log("wait for 100ms");
                this.play();
            }, 100);
            return false;
        }

        const c_playDiffDur = _this.frameTime * 1;

        // if (this.ready_now > 0) {

        // 得出几次平均耗时 然后重新做 patent
        if (this.playInterval === undefined || this.playInterval === null)
        {
            let calcuteStartTime    = 0;
            let nowTimestamp        = 0;
            let playFrameCostTime   = 0;
            // let frameTime           = Math.floor(1000 / _this.mediaInfo.fps);

            // let avgPlayFrameCost    = 0;
            // let onceTotalPlayCost   = 0; // PLAY_LOOP_COST_ONCE_TOTAL
            // let onceComputeCount    = 0;

            if (this.config.ignoreAudio < 1 &&
                this.mediaInfo.audioNone === false &&
                this.audioWAudio != null &&
                this.mediaInfo.noFPS === false)
            {
                console.log("playInterval entry first", 
                    this.config.ignoreAudio,
                    this.mediaInfo.audioNone,
                    this.audioWAudio,
                    this.mediaInfo.noFPS);
                // 1. 只是针对渲染的耗时
                // 2. @TODO-ZZ 继续加追帧
                this.playInterval = setInterval(function() {
                    nowTimestamp = AVCommon.GetMsTime();

                    // console.log("YUV cachestatus", _this.cache_status);
                    if (_this.cache_status)
                    {
                        if (nowTimestamp - calcuteStartTime >= _this.frameTime - playFrameCostTime)
                        { // play
                            let item = _this.YuvBuf.shift(); 
                            console.log("playInterval YUV pts playFrameCostTime", item.pts, _this.YuvBuf.length, playFrameCostTime);

                            if (item != undefined && item !== null) 
                            {
                                let diff = 0;
                                if (_this.audioWAudio !== null 
                                && _this.audioWAudio !== undefined) 
                                {
                                    diff = (item.pts - _this.audioWAudio.getAlignVPTS()) * 1000;
                                    
                                    if (
                                        (diff < 0 && diff * (-1) <= c_playDiffDur) ||
                                        (diff > 0 && diff <= c_playDiffDur) ||
                                        (diff === 0)
                                    ) {
                                        // Video慢于Audio时候: 小于1帧 => OK
                                        playFrameCostTime = AVCommon.GetMsTime() - nowTimestamp 
                                                + PLAY_LOOP_RESET_CORRECT_DUR_MS;
                                    } else if (diff > 0 && diff > c_playDiffDur) 
                                    {
                                        // @TODO video fast than audio more
                                        console.log("diff-- video>audio -->", diff);
                                        playFrameCostTime = AVCommon.GetMsTime() - nowTimestamp 
                                                + PLAY_LOOP_RESET_CORRECT_DUR_MS;
                                    } else { 
                                        if (diff < 0 && diff * (-1) > c_playDiffDur) {
                                            // @TODO video slow than audio more
                                            console.log("diff-- video<audio -->", diff);
                                            playFrameCostTime = _this.frameTime;
                                        } else {
                                            playFrameCostTime = _this.frameTime;
                                        }
                                        
                                    } // check diff
                                } else {
                                    playFrameCostTime = AVCommon.GetMsTime() - nowTimestamp 
                                        + PLAY_LOOP_RESET_CORRECT_DUR_MS;
                                }

                                if (_this.showScreen) { // on render
                                    // Render callback
                                    _this.onRender && _this.onRender(
                                        item.line_y, item.h, 
                                        item.bufY, item.bufU, item.bufV);
                                }
                                console.warn("RenderEngine420P.renderFrame item.pts", item.pts);

                                // render
                                RenderEngine420P.renderFrame(_this.AVGLObj, 
                                    item.bufY, item.bufU, item.bufV, 
                                    item.line_y, item.h);

                                
                            } // check videoFrame item is empty

                            // @TODO-ZZ 视频帧解码严重落后 cache
                            if (
                                _this.YuvBuf.length <= 0 || 
                                (_this.audioWAudio && _this.audioWAudio.sampleQueue.length <= 0)
                            ) {
                                console.log("YUV cacheing");
                                _this.cache_status = false;
                                _this.onLoadCache && _this.onLoadCache();
                                _this.audioWAudio && _this.audioWAudio.pause();
                            }

                            /*
                             * Cost Time
                             */
                            calcuteStartTime = nowTimestamp;
                            // playFrameCostTime = AVCommon.GetMsTime() - nowTimestamp 
                            //                     + PLAY_LOOP_RESET_CORRECT_DUR_MS;

                            // onceComputeCount += 1;
                            // onceTotalPlayCost += playFrameCostTime;
                            // if (onceComputeCount >= PLAY_LOOP_COST_ONCE_TOTAL) {
                            //     avgPlayFrameCost = onceTotalPlayCost / onceComputeCount;
                            //     onceComputeCount = 0;
                            //     onceTotalPlayCost = 0;
                            // }
                        } // check cost with yuv frame to play

                    } else {
                        playFrameCostTime = _this.frameTime;

                        // reset
                        // onceTotalPlayCost   = 0; // PLAY_LOOP_COST_ONCE_TOTAL
                        // onceComputeCount    = 0;
                    }
                }, 1); // this.playInterval
                this.audioWAudio && this.audioWAudio.play();

            } else {
                //nowTimestamp = -1;
                let firstStart = -1;
                this.playInterval = setInterval(function() {
                    nowTimestamp = AVCommon.GetMsTime();
                    //nowTimestamp = -1;

                    // console.log("YUV cachestatus", _this.cache_status);
                    if (_this.cache_status)
                    {
                        console.log(
                            "playInterval log:",
                            _this.YuvBuf.length,
                            "-->",
                            nowTimestamp, calcuteStartTime, 
                            nowTimestamp - calcuteStartTime,
                            ">=", 
                            _this.frameTime, playFrameCostTime,
                            _this.frameTime - playFrameCostTime,
                            ", _this.chaseFrame:", _this.chaseFrame
                        );
                        let now_diff_cal_dur = -1;
                        let before_frame_cost = -1;
                        if (firstStart > 0) {
                            now_diff_cal_dur = nowTimestamp - calcuteStartTime;
                            before_frame_cost = _this.frameTime - playFrameCostTime;

                            if (_this.chaseFrame <= 0 && playFrameCostTime > 0) {
                                //_this.chaseFrame = Math.floor(now_diff_cal_dur / before_frame_cost);
                                _this.chaseFrame = Math.floor(playFrameCostTime / _this.frameTime);
                                console.log("_this.chaseFrame:", now_diff_cal_dur, before_frame_cost, _this.chaseFrame);
                            }
                        }

                        //if (firstStart <= 0 || now_diff_cal_dur >= before_frame_cost || _this.chaseFrame > 0) // play
                        if (firstStart <= 0 || now_diff_cal_dur >= _this.frameTime || _this.chaseFrame > 0) // play
                        {
                            firstStart = 1;
                            let item = _this.YuvBuf.shift(); 
                            console.log("playInterval YUV pts playFrameCostTime", item.pts, _this.YuvBuf.length, playFrameCostTime);

                            if (item != undefined && item !== null) 
                            {
                                if (_this.showScreen) { // on render
                                    // Render callback
                                    _this.onRender && _this.onRender(
                                        item.line_y, item.h, 
                                        item.bufY, item.bufU, item.bufV);
                                }
                                console.warn("RenderEngine420P.renderFrame item.pts", item.pts);

                                // render
                                RenderEngine420P.renderFrame(_this.AVGLObj, 
                                    item.bufY, item.bufU, item.bufV, 
                                    item.line_y, item.h);

                                playFrameCostTime = AVCommon.GetMsTime() - nowTimestamp 
                                    + PLAY_LOOP_RESET_CORRECT_DUR_MS;
                            } // check videoFrame item is empty

                            // @TODO-ZZ 视频帧解码严重落后 cache
                            if (
                                _this.YuvBuf.length <= 0
                            ) {
                                console.log("YUV cacheing");
                                _this.cache_status = false;
                                _this.onLoadCache && _this.onLoadCache();
                            }

                            /*
                             * Cost Time
                             */
                            calcuteStartTime = nowTimestamp;
                            // playFrameCostTime = AVCommon.GetMsTime() - nowTimestamp 
                            //                     + PLAY_LOOP_RESET_CORRECT_DUR_MS;

                            // onceComputeCount += 1;
                            // onceTotalPlayCost += playFrameCostTime;
                            // if (onceComputeCount >= PLAY_LOOP_COST_ONCE_TOTAL) {
                            //     avgPlayFrameCost = onceTotalPlayCost / onceComputeCount;
                            //     onceComputeCount = 0;
                            //     onceTotalPlayCost = 0;
                            // }

                            if (_this.chaseFrame > 0) {
                                _this.chaseFrame--;
                                if (_this.chaseFrame === 0) {
                                    playFrameCostTime = _this.frameTime;
                                }
                            }
                        } // check cost with yuv frame to play

                    } else {
                        playFrameCostTime = _this.frameTime;
                        firstStart = -1;
                        _this.chaseFrame = 0;
                        calcuteStartTime    = 0;
                        nowTimestamp        = 0;
                        playFrameCostTime   = 0;

                        // reset
                        // onceTotalPlayCost   = 0; // PLAY_LOOP_COST_ONCE_TOTAL
                        // onceComputeCount    = 0;
                    }

                }, 1); // this.playInterval
            } // end if check audioNone to create play interval
            
        } // check this.playInterval is undefined or null


        this.onPlayState && this.onPlayState(this.isPlayingState());

        // this.playInterval = setInterval(function() {
        //     // console.log("YUV cachestatus", _this.cache_status);
        //     if (_this.cache_status <= 0) {
        //         let item = _this.YuvBuf.shift(); 
        //         console.log("YUV pts", item.pts, _this.YuvBuf.length);
        //         if (item != undefined && item !== null) {
        //             RenderEngine420P.renderFrame(_this.AVGLObj, item.bufY, item.bufU, item.bufV, item.line_y, item.h);
        //         }
        //         if (_this.YuvBuf.length <= 0) {
        //             console.log("YUV cacheing");
        //             _this.cache_status = 1;
        //         }
        //     }
        // }, 1000 / _this.mediaInfo.fps - 5);
        // }
    } // end func play

    start(url265) {
        let _this = this;
        console.warn("start fetch httpflv");
        // this.getPackageTimeMS = AVCommon.GetMsTime();
        
        this.workerFetch = new Worker(AVCommon.GetScriptPath(function() {
            let urlpath = null;
            let controller = new AbortController();
            let signal = controller.signal;

            // self.onmessage = (event) => {
            //     console.log(event);
            // };
            let _self = self;
            // console.log("self=", self);
            let fetchData = (url265) => {
                let fetchFinished = false;
                let startFetch = false;

                if (!startFetch) {
                    startFetch = true;
                    fetch(url265, {signal}).then(function(response) {
                        let pump = function(reader) {
                            return reader.read().then(function(result) {
                                if (result.done) {
                                    console.log("========== RESULT DONE ===========");
                                    fetchFinished = true;
                                    self.postMessage({
                                        cmd: 'fetch-fin',
                                        data: null, 
                                        msg: 'fetch-fin'
                                    });
                                    // window.clearInterval(networkInterval);
                                    // networkInterval = null;
                                    return;
                                }

                                let chunk = result.value;
                                self.postMessage({
                                    cmd: 'fetch-chunk',
                                    data: chunk, 
                                    msg: 'fetch-chunk'
                                });
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
                                ' httplive request error:' + 
                                error + 
                                ' start to retry';
                            console.error(errMsg);
                            self.postMessage({
                                cmd: 'fetch-error',
                                data: errMsg, 
                                msg: 'fetch-error'
                            });
                        } // end check error
                        
                    });
                }
            }; // fetchData

            self.onmessage = (event) => {
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
                        urlpath = body.data;
                        fetchData(urlpath);
                        self.postMessage({
                            cmd: 'startok',
                            data: 'WORKER STARTED', 
                            msg: 'startok'
                        });
                        break;
                    case 'stop':
                        console.log("workerInterval stop fetch");
                        // console.log("worker stop");
                        // postMessage('WORKER STOPPED: ' + body);
                        controller.abort();
                        self.close(); // Terminates the worker.
                        self.postMessage({
                            cmd: 'close',
                            data: 'close',
                            msg: 'close'
                        });
                        break;
                    case 'retry':
                        console.warn("workerInterval retry"); // @TODO
                        controller.abort();
                        controller = null;
                        signal = null;
                        controller = new AbortController();
                        signal = controller.signal;
                        setTimeout(function() {
                            fetchData(urlpath);
                        }, 3000);
                    default:
                        // console.log("worker default");
                        // console.log("worker.body -> default: ", body);
                        // worker.postMessage('Unknown command: ' + data.msg);
                        break;
                };
            }; // self.onmessage
        })); // end this.workerFetch

        this.workerFetch.onmessage = function(event) {
            _this._workerFetch_onmessage(event, _this);
        };

        console.log("this.workerFetch flv=>", this.workerFetch);

        // const TOKEN_SECRET = "base64:QXV0aG9yOmNoYW5neWFubG9uZ3xudW1iZXJ3b2xmLEdpdGh1YjpodHRwczovL2dpdGh1Yi5jb20vbnVtYmVyd29sZixFbWFpbDpwb3JzY2hlZ3QyM0Bmb3htYWlsLmNvbSxRUTo1MzEzNjU4NzIsSG9tZVBhZ2U6aHR0cDovL3h2aWRlby52aWRlbyxEaXNjb3JkOm51bWJlcndvbGYjODY5NCx3ZWNoYXI6bnVtYmVyd29sZjExLEJlaWppbmcsV29ya0luOkJhaWR1";

        // this.corePtr = Module.cwrap("AVSniffHttpFlvInit", "number", ["string", "string"])(
        //     TOKEN_SECRET, '0.0.0'
        // );
        // console.log("wasmHttpFLVLoaded!!", this.corePtr);

        console.log("start add function probeCallback");
        this._ptr_probeCallback   = Module.addFunction(this._callbackProbe.bind(this), "vdiidiiiiii");

        console.log("start add function yuvCallback");
        this._ptr_yuvCallback     = Module.addFunction(this._callbackYUV.bind(this), "viiiiiiiidi");

        console.log("start add function naluCallback");
        this._ptr_naluCallback    = Module.addFunction(this._callbackNALU.bind(this), "viiiiidd");

        console.log("start add function sampleCallback");
        this._ptr_sampleCallback  = Module.addFunction(this._callbackPCM.bind(this), "viiid");

        console.log("start add function aacCallback");
        this._ptr_aacCallback     = Module.addFunction(this._callbackAAC.bind(this), "viiid"); 

        let callbackRet = Module.cwrap(
            "initializeSniffHttpFlvModule",
            "number",
            ["number", 
                "number", "number", "number", "number", "number", 
                "number"])
            (this.corePtr, 
                this._ptr_probeCallback, 
                this._ptr_yuvCallback, this._ptr_naluCallback, 
                this._ptr_sampleCallback, this._ptr_aacCallback, 
                this.config.ignoreAudio);
        console.log("create_media_processor callbackRet: ", callbackRet);

        this.AVGLObj = RenderEngine420P.setupCanvas(this.CanvasObj, {preserveDrawingBuffer: false})

        // var url265 = "https://ahekv0bx0fsc5jjda5z.down.evs.bcelive.com/evs/hsnFWkELtOSv.flv?timestamp=1632799645&token=412ca3ab22886dd6faac3a405ed69de265abdb86afae91cf1861d78d05cd61e7";
        this.workerFetch.postMessage({cmd: "start", data: url265, msg: "start"});

        this._decode();
        // this._createDecVframeInterval(V_CACHE_INTERVAL_PUSH_LOOP_MS)
        // this.play();
    } // end func startPost


} // end class CHttpLiveCoreModule

exports.CHttpLiveCore = CHttpLiveCoreModule;
