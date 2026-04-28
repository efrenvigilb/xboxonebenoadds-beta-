(() => {
  "use strict";
  const API = chrome || browser;
  const DIALOG_BOX_CONTENER_CLASS = "abfy-dialog-box";
  const DIALOG_BOX_OVERLAY_CLASS = "abfy-dialog-overlay";
  const DIALOG_BOX_CLOSE_CLASS = "abfy-dialog-close";
  const DIALOG_BOX_HEADER_CLASS = "abfy-dialog-header";
  const DIALOG_BOX_BUTTON_CLASS = "abfy-dialog-button";
  const DIALOG_BOX_STYLE_CLASS = "abfy-dialog-style";

  const IN_VIDEO_SELECTOR = "#error-screen > #container";
  const POPUP_SELECTOR = ".ytd-popup-container > #container";
  const TEXT_TO_CHECK = "ad block";

  const STORAGE_KEY_ENABLED = "enabled";
  const STORAGE_KEY_SIMPLE_MODE = "simpleMode";
  const STORAGE_KEY_REQUEST_LOAD = "loadRequest";
  const STORAGE_KEY_REQUEST_TAB = "tabRequest";
  const STORAGE_KEY_UPDATE = "isUpdate";
  const STORAGE_KEY_RATING = "isRateing";
  const STORAGE_KEY_RATING_NEXT = "nextRating";
  const STORAGE_KEY_VIDEO_COUNT = "videoCount";
  const STORAGE_KEY_ANTI_BLOCKER = "isAntiAdblock";
  const STORAGE_KEY_ANTI_SHOW = "isAntiShow";
  const STORAGE_KEY_DO_NOT_SHOW = "doNotShow";
  const STORAGE_KEY_DIALOG_SHOW = "dialogShow";

  const DEFAULT_EXTENSION_SETTINGS = {
    [STORAGE_KEY_ENABLED]: true,
    [STORAGE_KEY_REQUEST_LOAD]: true,
    [STORAGE_KEY_SIMPLE_MODE]: false,
    [STORAGE_KEY_REQUEST_TAB]: false,
    [STORAGE_KEY_RATING]: true,
    [STORAGE_KEY_RATING_NEXT]: 5,
    [STORAGE_KEY_ANTI_BLOCKER]: true,
    [STORAGE_KEY_ANTI_SHOW]: true,
    [STORAGE_KEY_VIDEO_COUNT]: 0,
    [STORAGE_KEY_DIALOG_SHOW]: 1,
    [STORAGE_KEY_DO_NOT_SHOW]: 2880
  };

  const STYLE_SHEET = {
    [`.${DIALOG_BOX_OVERLAY_CLASS}`]: {
      "top": "0",
      "left": "0",
      "width": "100%",
      "height": "100%",
      "z-index": "9999",
      "opacity": "1",
      "display": "flex",
      "position": "fixed",
      "justify-content": "center",
      "transition": "opacity 1s ease",
      "background-color": "#00000099",
      "align-items": "flex-start"
    },
    [`.${DIALOG_BOX_CONTENER_CLASS}`]: {
      "width": "300px",
      "min-height": "50px",
      "border": "none",
      "overflow": "auto",
      "padding": "16px",
      "margin-top": "48px",
      "box-sizing": "border-box",
      "max-height": "100%",
      "box-shadow": "1px 1px 10px 0 #00000099",
      "border-radius": "2px"
    },
    [`.${DIALOG_BOX_CLOSE_CLASS}`]: {
      "vertical-align": "middle",
      "color": "inherit",
      "outline": "none",
      "background": "none",
      "float": "right",
      "margin": "0",
      "border": "none",
      "padding": "0",
      "width": "26px",
      "height": "26px",
      "line-height": "0",
      "cursor": "pointer"
    },
    [`.${DIALOG_BOX_HEADER_CLASS}`]: {
      "padding": "0 36px 16px 0px",
      "font-size": "var(--ytd-subheadline-font-size)",
      "font-weight": "var(--ytd-subheadline-font-weight)",
      "line-height": "var(--ytd-subheadline-line-height)",
      "letter-spacing": "var(--ytd-subheadline-letter-spacing)"
    },
    [`.${DIALOG_BOX_BUTTON_CLASS}`]: {
      "text-transform": "uppercase",
      "display": "block",
      "white-space": "pre",
      "margin-right": "4px",
      "margin-bottom": "4px",
      "font-size": "14px",
      "width": "100%",
      "border-radius": "2px",
      "padding": "10px 16px 10px 28px",
      "border": "1px solid var(--yt-spec-10-percent-layer)",
      "background-color": "var(--yt-spec-badge-chip-background)",
      "text-indent": "-17px",
      "box-sizing": "border-box",
      "white-space": "normal",
      "text-align": "left",
      "cursor": "pointer"
    }
  };

  const $ = (ele)=> {elemnts = document.querySelectorAll(ele); return elemnts? elemnts.length > 1 ? elemnts : elemnts[0] : null;};

  const domReady = (callback) =>{
    document.readyState === "complete" ? callback() : window.addEventListener("load", callback, { once: true});
  }

  const isIframe = () =>{
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  };

  const convertMinutesToMilliseconds = (minutes) => {
    // There are 60 seconds in a minute, and 1000 milliseconds in a second.
    return minutes * 60 * 1000;
  };

  const getAllExtensionSettings = async()=> {
    try {
      const storedSettings = await API.storage.local.get(Object.keys(DEFAULT_EXTENSION_SETTINGS));
      return { ...DEFAULT_EXTENSION_SETTINGS, ...storedSettings};
    } catch (error) {
      console.error("Error getting extension settings:", error);
      return DEFAULT_EXTENSION_SETTINGS;
    }
  };

  const getSettings = (key)=>{return new Promise(resolve => {API.storage.local.get([key], (result) => {resolve(result[key]);});});};
  const setSettings = (settingsObject) => {
    return new Promise((resolve, reject) => {
      API.storage.local.set(settingsObject, () => {
        if (API.runtime.lastError) {
          console.error("Error setting storage:", API.runtime.lastError.message);
          reject(API.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  };

  const newVersionAvalable = (ver)=> {
    try {
      const parts1 = String(ver).split('.').map(Number);
      const parts2 = String(API.runtime.getManifest().version).split('.').map(Number);
      const maxLength = Math.max(parts1.length, parts2.length);
      for (let i = 0; i < maxLength; i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) {
          return true;
        } else if (part1 < part2) {
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error("Error:", error);
      return false; 
    }
  }

  const extractAndCreateStyle = async (custom)=>{
    const tagStyle = document.querySelector(`.${DIALOG_BOX_STYLE_CLASS}`);
    if (tagStyle) {
      return;
    }

    const targetElement = await new Promise((resolve) => {
      const intervalCheck = 100;
      const timeoutDuration = 10000;
      const startTime = Date.now();

      const intervalId = window.setInterval(() => {
        const element = document.head || document.querySelector("head");
        if (element || Date.now() > startTime + timeoutDuration) {
          clearInterval(intervalId);
          resolve(element);
        }
      }, intervalCheck);
    });

    if (!targetElement) {
      console.warn("Target element head not found.");
      return;
    }

    const convertObjectToCssString = await new Promise((resolve) => {
      let styleString = "";
      const sheet = { ...STYLE_SHEET, ...custom}
      for (const item in sheet) {
        styleString += `${item} {`;
        const style = STYLE_SHEET[item];
        for(const key in style){
          styleString += `${key}: ${style[key]};`;
        }
        styleString += `} `;
      }
      resolve(styleString);
    });

    if (!convertObjectToCssString) {
      console.log("convert Object To Css String not working!");
      return;
    }
    const tagsStyleContainer = document.createElement("style");
    tagsStyleContainer.classList.add(DIALOG_BOX_STYLE_CLASS);
    console.log(convertObjectToCssString);
    tagsStyleContainer.textContent = convertObjectToCssString;
    targetElement.append(tagsStyleContainer);
  };

  const createDialog = async(options = {})=>{
    const {
      title = '',
      buttons = [],
      customStyles = {},
      closeOnOverlayClick = true,
      showCloseButton = true,
    } = options;

    await extractAndCreateStyle(customStyles);

    const bodyElement = await new Promise((resolve) => {
      const intervalCheck = 100;
      const timeoutDuration = 10000;
      const startTime = Date.now();

      const intervalId = window.setInterval(() => {
        const element = document.body || document.getElementsByTagName("body")[0];
        if (element || Date.now() > startTime + timeoutDuration) {
          clearInterval(intervalId);
          resolve(element);
        }
      }, intervalCheck);
    });

    if (!bodyElement) {
      console.warn("Target element body not found. Aborting tag extraction.");
      return {};
    }

    const overlay = document.createElement("div");
    overlay.className = DIALOG_BOX_OVERLAY_CLASS;

    const handleOverlayClick = (event)=> {
      return event.target === overlay ? handleClose(event) : null;
    }

    const handleKeydown = (event)=> {
      event.code === "Escape" ? handleClose(event) : null;
    }

    const handleClose = (event)=> {
      overlay.style.opacity = 0;
      setTimeout(() => {overlay.parentElement.removeChild(overlay);}, 300);
      overlay.removeEventListener("click", handleOverlayClick);
      closeButton.removeEventListener("click", handleClose);
      window.removeEventListener("keypress", handleKeydown);
      setSettings({[STORAGE_KEY_DIALOG_SHOW]: Date.now()});
    }

    overlay.addEventListener("click", handleOverlayClick);
    window.addEventListener("keydown", handleKeydown);

    const dialog = document.createElement("dialog");
    dialog.open = true;
    dialog.className = DIALOG_BOX_CONTENER_CLASS;
    overlay.appendChild(dialog);

    const closeButton = document.createElement("button");
    closeButton["aria-label"] = "Cancel";
    closeButton.className = DIALOG_BOX_CLOSE_CLASS;
    closeButton.addEventListener("click", handleClose);
    dialog.appendChild(closeButton);

    const closeIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    closeIcon.setAttribute("viewBox", "0 0 24 24");
    closeIcon.focusable = false;
    closeButton.appendChild(closeIcon);

    const closePath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    closePath.setAttribute(
      "d",
      "M12.7,12l6.6,6.6l-0.7,0.7L12,12.7l-6.6,6.6l-0.7-0.7l6.6-6.6L4.6,5.4l0.7-0.7l6.6,6.6l6.6-6.6l0.7,0.7L12.7,12z"
    );
    closeIcon.appendChild(closePath);

    const header = document.createElement("h2");
    header.className = DIALOG_BOX_HEADER_CLASS;
    header.textContent = title;
    dialog.appendChild(header);

    const content = document.createElement("div");
    dialog.appendChild(content);

    buttons.forEach(buttonOptions => {
      const btn = document.createElement("button");
      btn.className = DIALOG_BOX_BUTTON_CLASS;
      btn.textContent = buttonOptions.text;
      if (buttonOptions.link) {
        btn.addEventListener('click', () => {
          window.open(buttonOptions.link, '_blank');
          if (buttonOptions.onClick) {
            buttonOptions.onClick();
          }
        });
      } else if (buttonOptions.onClick) {
        btn.addEventListener('click', buttonOptions.onClick);
        btn.addEventListener('click', handleClose);
      }
      content.appendChild(btn);
    });

    bodyElement.appendChild(overlay);

    return {
      dialog,
      header,
      content,
      close: handleClose
    };

  };

  const handleAntiAdblockDetection = (settings) => {
    if (location.pathname !== '/watch') {
      return false; // Return false or simply return undefined if not on a watch page.
    }

    const errorContainers = document.querySelectorAll(`${IN_VIDEO_SELECTOR}, ${POPUP_SELECTOR}`);
    const isTargetIncludesErrorText = Array.from(errorContainers).some((container) => {
      const content = container.textContent;
      return content ? content.toLowerCase().includes(TEXT_TO_CHECK.toLowerCase()) : false;
    });

    if (isTargetIncludesErrorText && settings[STORAGE_KEY_ANTI_BLOCKER] && settings[STORAGE_KEY_ANTI_SHOW]) {

      let antiButtons = [];
      let antiDialogInstance; 
      let antiTitle = `To fix this, please disable all other ad blockers besides ${API.i18n?.getMessage("extensionName")} and reload the page.`;

      if (!settings[STORAGE_KEY_SIMPLE_MODE]) {
        antiTitle += ' If you think this is causing problems, you can try "Safe Mode" by clicking the button below.';
        antiButtons.push({
          text: "✅ Enable Safe Mode",
          onClick: () => {
            setSettings({
              [STORAGE_KEY_SIMPLE_MODE]: true,
              [STORAGE_KEY_ANTI_SHOW]: false
            });
          },
        });
      }

      antiButtons.push({
        text: "🔃 Reload Page",
        onClick: () => {
          location.reload();
        },
      });

      createDialog({
        title: antiTitle,
        buttons: antiButtons,
      });
    }
  };

  const setDialog = async(details, settings)=>{
    if (isIframe() || !settings[STORAGE_KEY_ENABLED]) return;
    if (Date.now() - settings[STORAGE_KEY_DIALOG_SHOW] > convertMinutesToMilliseconds(settings[STORAGE_KEY_DO_NOT_SHOW])) {
      const navigateHandler = ()=> { return setTimeout(()=> {return handleAntiAdblockDetection(settings);}, 1000);};
      document.addEventListener('yt-navigate-finish', navigateHandler);

      const storeVersion = await getSettings(details.browser);
      if (storeVersion && settings[STORAGE_KEY_UPDATE]) {
        if (newVersionAvalable(storeVersion)) {
          createDialog({
            title: `${API.i18n?.getMessage("extensionName")} available on the new version(${storeVersion}). Update it`,
            buttons: [{
              text: `⚙ Update now`,
              link: details.webstore
            }]
          });
        }
      }

      if (settings[STORAGE_KEY_RATING] && 
        settings[STORAGE_KEY_RATING_NEXT] && 
        settings[STORAGE_KEY_VIDEO_COUNT] > 
        settings[STORAGE_KEY_RATING_NEXT]) {
        const timeSaved = Math.ceil(settings[STORAGE_KEY_VIDEO_COUNT] *  0.5);
        const timeTitle = API.i18n?.getMessage("timesaveInfo", [
          new Intl.NumberFormat(undefined, {
            style: "unit",
            unit: "minute",
            unitDisplay: "long",
          }).format(timeSaved),
        ]);
        createDialog({
          title: timeTitle,
          buttons: [{
              text: `❤️ ${API.i18n.getMessage("helpUsWithAReview")}`,
              onClick: () => {
                window.open(details.webstore, "_blank");
                setSettings({[STORAGE_KEY_RATING_NEXT]: false});
              }
            },
            {
              text: `💨  ${API.i18n?.getMessage("later")}`,
              onClick: () => {
                setSettings({[STORAGE_KEY_RATING_NEXT]: settings[STORAGE_KEY_VIDEO_COUNT] + 10});
              }
            },
            {
              text: `👎  ${API.i18n?.getMessage("dontAskAgain")}`,
              onClick: () => {
                setSettings({[STORAGE_KEY_RATING_NEXT]: false});
              }
            }]
        });
      }
    }
  }

  const requestReloadTab = ()=>{
    getAllExtensionSettings().then(async(settings)=>{
      if (settings[STORAGE_KEY_REQUEST_LOAD]) {
        const tab = settings[STORAGE_KEY_REQUEST_TAB];
        if (tab) {
          await API.storage.local.set({[STORAGE_KEY_REQUEST_TAB]: false});
          await API.runtime.sendMessage({action: "PAGE_RELOAD", message: tab}); 
        }else {
          await API.runtime.sendMessage({action: "PAGE_READY",},(details) => {
            setDialog(details, settings);
          }); 
        }
      } 
    });
  };

  domReady(async()=>{
    await requestReloadTab();
  });
})();