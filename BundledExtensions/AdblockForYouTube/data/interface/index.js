const API = chrome || browser;
const $ = (ele)=> {elemnts = document.querySelectorAll(ele); return elemnts? elemnts.length > 1 ? elemnts : elemnts[0] : null;};
const domReady = (callback) =>{document.readyState === "complete" ? callback() : window.addEventListener("load", callback, { once: true});}

const allStorage = ()=> {
  return new Promise((resolve, reject)=> {
    API.storage.local.get({
    "enabled": true,
    "simpleMode": false,
    "videoCount": 0
  }, (o)=>{resolve(o);});});
}

const translate = () => {
  return new Promise((resolve) => {
    const elements = $("[data-message]");
    for (const element of elements) {
      const key = element.dataset.message;
      const message = API.i18n.getMessage(key);
      if (message) {
        element.textContent = message;
      } else {
        console.error("Missing API.i18n message:", key);
      }
    }
    resolve();
  });
}

domReady(async() => {
  translate();
  const myStorage = await allStorage();
  // Hydrate Logo
  const $logo = $(".logo");
  $logo.src = myStorage.simpleMode ? "../icons/icon-simple-128.png": "../icons/icon-128.png";
  $logo.style.filter = myStorage.enabled ? "grayscale(0)" : "grayscale(100%)";
  $logo.style.opacity = myStorage.enabled ? "1" : "0.7";


  // Hydrate Timesave info
  const $timeSaveInfo = $(".timesave-info");
  const adTimePerVideo = 0.5;
  const timeSaved = Math.ceil(myStorage.videoCount * adTimePerVideo);
  $timeSaveInfo.textContent = API.i18n.getMessage("timesaveInfo", [
    new Intl.NumberFormat(undefined, {
      style: "unit",
      unit: "minute",
      unitDisplay: "long",
    }).format(timeSaved),
  ]);

  const $checkboxSimple = $("#simple");
  $checkboxSimple.checked = myStorage.simpleMode;

  $labelSimple = $("label[for='simple']");

  //update Simple Mode
  $labelSimple.style.opacity = myStorage.enabled ? "1": "0.5";
  $labelSimple.style.pointerEvents = myStorage.enabled ? "visible": "none";
  $labelSimple.style.filter = myStorage.enabled ? "grayscale(0)" : "grayscale(100%)";


  $checkboxSimple.addEventListener("change", async (event) => {
    const simpleMode = event.currentTarget.checked;
    // Persist
    await API.storage.local.set({ simpleMode });
    $logo.src = simpleMode ? "../icons/icon-simple-128.png": "../icons/icon-128.png";
  });


  // Hydrate Checkbox Label
  const $checkboxLabel = $("[data-message=enabled]");
  $checkboxLabel.textContent = API.i18n.getMessage(myStorage.enabled ? "enabled" : "disabled");

  // Hydrate Checkbox Label
  const $enabledCheckbox = $("input[name=enabled]");
  $enabledCheckbox.checked = myStorage.enabled;

  $enabledCheckbox.addEventListener("change", async (event) => {
    const enabled = event.currentTarget.checked;
    // Persist
    await API.storage.local.set({ enabled });
    // Update Checkbox Label
    $checkboxLabel.textContent = API.i18n.getMessage(enabled ? "enabled" : "disabled");
    // Update Logo
    $logo.style.filter = enabled ? "grayscale(0)" : "grayscale(100%)";
    $logo.style.opacity = enabled ? "1" : "0.7";

    //update Simple Mode
    $labelSimple.style.opacity = enabled ? "1": "0.5";
    $labelSimple.style.filter = enabled ? "grayscale(0)" : "grayscale(100%)";
    $labelSimple.style.pointerEvents = enabled ? "visible": "none";

  });

});






