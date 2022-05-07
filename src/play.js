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
// const H265webjs = require('./src/h265webjs');
import H265webjsModule from './dist/index';

const SHOW_LOADING = "loading...";
const SHOW_DONE = "done.";


function durationFormatSubVal(val) {
    let valStr = val.toString();
    if (valStr.length < 2) {
        return '0' + valStr;
    }
    return valStr;
}

function durationText(duration) {
    if (duration < 0) {
        return "Play";
    }
    let durationSecInt = Math.round(duration);
    return durationFormatSubVal(Math.floor(durationSecInt / 3600))
    + ":" + durationFormatSubVal(Math.floor((durationSecInt % 3600) / 60))
    + ":" + durationFormatSubVal(Math.floor(durationSecInt % 60));
}

const getMsTime = () => {
    return new Date().getTime();
};


/***************************************************
 *
 *
 *
 * 1. H.265/HEVC MP4/FLV/HLS/TS 
 * Demo for create player(MP4/FLV/HLS/TS)
 * 点播/直播播放器创建Demo(MP4/FLV/HLS/TS)
 *
 *
 *
 ***************************************************/
// clear cache count
H265webjsModule.clear();
global.makeH265webjs = (videoURL, config) => {
    let playerId        = config.player;

    let playerObj       = H265webjsModule.createPlayer(videoURL, config);

    let playerDom       = document.querySelector('#' + playerId);
    let playerCont      = document.querySelector('#player-container');
    let controllerCont  = document.querySelector('#controller');
    let progressCont    = document.querySelector('#progress-contaniner');
    let progressContW   = progressCont.offsetWidth;
    let cachePts        = progressCont.querySelector('#cachePts');
    let progressPts     = progressCont.querySelector('#progressPts');
    let progressVoice   = document.querySelector('#progressVoice');
    let playBar         = document.querySelector('#playBar');
    let playBtn         = playBar.getElementsByTagName('a')[0];
    let showLabel       = document.querySelector('#showLabel');
    let ptsLabel        = document.querySelector('#ptsLabel');
    let coverToast      = document.querySelector('#coverLayer');
    let coverBtn        = document.querySelector('#coverLayerBtn');
    let muteBtn         = document.querySelector('#muteBtn');
    // let debugYUVBtn     = document.querySelector('#debugYUVBtn');
    // let debugYUVATag    = document.querySelector('#debugYUVUrl');
    let fullScreenBtn   = document.querySelector('#fullScreenBtn');
    let mediaInfo       = null;

    playBtn.disabled    = true;
    // playBar.textContent = '>';
    showLabel.textContent = SHOW_LOADING;
    playerCont.style.width = config.width + 'px';
    playerCont.style.height = config.height + 'px';
    controllerCont.style.width = config.width + 'px';
    // bottom: 627.875
    // height: 540
    // left: 240
    // right: 1200
    // top: 87.875
    // width: 960
    // x: 240
    // y: 87.875
    // playerDom.getBoundingClientRect().top
    console.log(
        "playerDom.getBoundingClientRect().height", playerDom.getBoundingClientRect());
    controllerCont.style.top = 
        playerDom.getBoundingClientRect().top 
        + config.height 
        - 50 + 'px';
    controllerCont.style.left = playerDom.getBoundingClientRect().left + 'px';

    let muteState = false;

    // controllerCont.style.left = playerContainer.clientLeft;
    // controllerCont.style.bottom = playerContainer.clientBottom;
    // alert(playerContainer.clientLeft);

    let playAction = () => {
        console.log("is playing:", playerObj.isPlaying());
        if (playerObj.isPlaying()) {
            console.log("bar pause============>");
            // playBar.textContent = '>';
            playBar.setAttribute('class', 'playBtn');
            playerObj.pause();
        } else {
            // playBar.textContent = '||';
            playBar.setAttribute('class', 'pauseBtn');
            playerObj.play();
        }
    };

    playerCont.onmouseover = function() {
        controllerCont.hidden = false;
    };

    playerCont.onmouseout = function() {
        controllerCont.hidden = true;
    };

    playerDom.onmouseup = function() {
        playAction();
    };

    playBtn.onclick = () => {
        playAction();
    };

    muteBtn.onclick = () => {
        console.log(playerObj.getVolume());
        if (muteState === true) {
            playerObj.setVoice(1.0);
            progressVoice.value = 100;
        } else {
            playerObj.setVoice(0.0);
            progressVoice.value = 0;
        }
        muteState = !muteState;
    };

    fullScreenBtn.onclick = () => {
        playerObj.fullScreen();
        // setTimeout(() => {
        //     playerObj.closeFullScreen();
        // }, 2000);
    };

    progressCont.addEventListener('click', (e) => {
        showLabel.textContent = SHOW_LOADING;
        let x = e.pageX - progressCont.getBoundingClientRect().left; // or e.offsetX (less support, though)
        let y = e.pageY - progressCont.getBoundingClientRect().top;  // or e.offsetY
        let clickedValue = x * progressCont.max / progressCont.offsetWidth;
        // alert(clickedValue);
        playerObj.seek(clickedValue);
    });

    progressVoice.addEventListener('click', (e) => {
        let x = e.pageX - progressVoice.getBoundingClientRect().left; // or e.offsetX (less support, though)
        let y = e.pageY - progressVoice.getBoundingClientRect().top;  // or e.offsetY
        let clickedValue = x * progressVoice.max / progressVoice.offsetWidth;
        progressVoice.value = clickedValue;
        let volume = clickedValue / 100;
        // alert(volume);
        // console.log(
        //     progressVoice.offsetLeft, // 209
        //     x, y, // 324 584
        //     progressVoice.max, progressVoice.offsetWidth);
        playerObj.setVoice(volume);
    });

    playerObj.onSeekStart = (pts) => {
        showLabel.textContent = SHOW_LOADING + " seek to:" + parseInt(pts);
    };

    playerObj.onSeekFinish = () => {
        showLabel.textContent = SHOW_DONE;
    };

    playerObj.onPlayFinish = () => {
        console.log("============= FINISHED ===============");
        // playBar.textContent = '>';
        playBar.setAttribute('class', 'playBtn');
        // playerObj.release();
        // console.log("=========> release ok");
    };

    playerObj.onRender = (width, height, imageBufferY, imageBufferB, imageBufferR) => {
        console.log("on render");
    };

    playerObj.onOpenFullScreen = () => {
        console.log("onOpenFullScreen");
    };

    playerObj.onCloseFullScreen = () => {
        console.log("onCloseFullScreen");
    };

    playerObj.onSeekFinish = () => {
        showLabel.textContent = SHOW_DONE;
    };

    playerObj.onNetworkError = (error) => {
        alert("player - onNetworkError" + error.toString());
    }; // onNetworkError

    playerObj.onLoadCache = () => {
        showLabel.textContent = "Caching...";
    };

    playerObj.onLoadCacheFinshed = () => {
        showLabel.textContent = SHOW_DONE;
    };

    playerObj.onReadyShowDone = () => {
        console.log("onReadyShowDone");
        showLabel.textContent = "Cover Img OK";
    };

    playerObj.onLoadFinish = () => {
        playerObj.setVoice(1.0);
        mediaInfo = playerObj.mediaInfo();
        console.log("mediaInfo===========>", mediaInfo);

        if (mediaInfo.meta.isHEVC === false) {
            console.log("is not HEVC/H.265 media!");
            // coverToast.removeAttribute('hidden');
            // coverBtn.style.width = '100%';
            // coverBtn.style.fontSize = '50px';
            // coverBtn.innerHTML = 'is not HEVC/H.265 media!';
            // return;
        }
        // console.log("is HEVC/H.265 media.");
        /*
        meta:
            durationMs: 144400
            fps: 25
            sampleRate: 44100
            size: {
                width: 864,
                height: 480
            },
            audioNone : false
        videoType: "vod"
        */
        playBtn.disabled = false;

        if (mediaInfo.meta.audioNone) {
            progressVoice.value = 0;
            progressVoice.style.display = 'none';
        } else {
            playerObj.setVoice(0.5);
        }

        if (mediaInfo.videoType == "vod") {
            cachePts.max = mediaInfo.meta.durationMs / 1000;
            progressCont.max = mediaInfo.meta.durationMs / 1000;
            ptsLabel.textContent = durationText(0) + '/' + durationText(progressCont.max);
        } else {
            cachePts.hidden = true;
            progressCont.hidden = true;
            ptsLabel.textContent = 'LIVE';

            // if (mediaInfo.meta.audioNone === true) {
            //     // playBar.textContent = '||';
            //     playerObj.play();
            // } else {

            //     coverToast.removeAttribute('hidden');
            //     coverBtn.onclick = () => {
            //         // playBar.textContent = '||';
            //         // playerObj.play();
            //         playAction();
            //         coverToast.setAttribute('hidden', 'hidden');
            //     };
            // }

        }

        showLabel.textContent = SHOW_DONE;
    };

    playerObj.onCacheProcess = (cPts) => {
        // console.log("onCacheProcess => ", cPts);
        try {
            // cachePts.value = cPts;
            let precent = cPts / progressCont.max;
            let cacheWidth = precent * progressContW;
            // console.log(precent, precent * progressCont.offsetWidth);
            cachePts.style.width = cacheWidth + 'px';
        } catch(err) {
            console.log(err);
        }
    };

    playerObj.onPlayTime = (videoPTS) => {
        if (mediaInfo.videoType == "vod") {
            // progressPts.value = videoPTS;
            let precent = videoPTS / progressCont.max;
            let progWidth = precent * progressContW;
            // console.log(precent, precent * progressCont.offsetWidth);
            progressPts.style.width = progWidth + 'px';

            ptsLabel.textContent = durationText(videoPTS) + '/' + durationText(progressCont.max);
        } else {
            // ptsLabel.textContent = durationText(videoPTS) + '/LIVE';
            ptsLabel.textContent = '/LIVE';
        }
    };

    playerObj.onPlayState = (status) => {
        console.log("playerObj.onPlayState=>", status);
        if (status === true) {
            playBar.setAttribute('class', 'pauseBtn');
        } else {
            playBar.setAttribute('class', 'playBtn');
        }
    };

    playerObj.do();
    return playerObj;
};
