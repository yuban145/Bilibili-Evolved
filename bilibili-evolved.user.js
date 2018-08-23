// ==UserScript==
// @name         Bilibili Evolved
// @version      1.2.3
// @description  增强哔哩哔哩Web端体验.
// @author       Grant Howard
// @match        *://*.bilibili.com/*
// @match        *://*.bilibili.com
// @run-at       document-end
// @updateURL    https://github.com/the1812/Bilibili-Evolved/raw/master/bilibili-evolved.user.js
// @downloadURL  https://github.com/the1812/Bilibili-Evolved/raw/master/bilibili-evolved.user.js
// @supportURL   https://github.com/the1812/Bilibili-Evolved/issues
// @homepage     https://github.com/the1812/Bilibili-Evolved
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @icon         https://raw.githubusercontent.com/the1812/Bilibili-Evolved/master/images/logo.png
// ==/UserScript==
(self$ =>
{
    const $ = unsafeWindow.$ || self$;
    const settings = {
        fixFullscreen: false,
        removeLiveWatermark: true,
        harunaScale: true,
        removeAds: true,
        hideTopSearch: false,
        touchVideoPlayerAnimation: false,
        touchNavBar: false,
        touchVideoPlayer: false,
        watchLaterRedirect: true,
        expandDanmakuList: true,
        customStyleColor: "#00A0D8",
        blurBackgroundOpacity: 0.382,
        overrideNavBar: true,
        showBanner: true,
        useDarkStyle: false,
        useNewStyle: true
    };
    function loadSettings()
    {
        for (const key in settings)
        {
            settings[key] = GM_getValue(key, settings[key]);
        }
        settings.guiSettings = true;
    }
    function saveSettings(newSettings)
    {
        for (const key in settings)
        {
            GM_setValue(key, newSettings[key]);
        }
    }
    function downloadText(url, load, error)
    {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () => load && load(xhr.responseText));
        xhr.addEventListener("error", () => error && error(xhr.responseText));
        xhr.open("GET", url);
        xhr.send();
    }

    class SpinQuery
    {
        constructor(query, condition, action, onFailed)
        {
            this.maxRetry = 30;
            this.retry = 0;
            this.queryInterval = 500;
            this.query = query;
            this.condition = condition;
            this.action = action;
            this.onFailed = onFailed;
        }
        start()
        {
            this.tryQuery(this.query, this.condition, this.action, this.onFailed);
        }
        tryQuery(query, condition, action, onFailed)
        {
            if (this.retry >= this.maxRetry)
            {
                if (onFailed)
                {
                    onFailed();
                }
            }
            else
            {
                const result = query();
                if (condition(result))
                {
                    action(result);
                }
                else
                {
                    this.retry++;
                    setTimeout(() => this.tryQuery(query, condition, action, onFailed), this.queryInterval);
                }
            }
        }
        static any(query, action)
        {
            new SpinQuery(query, it => it.length > 0, action).start();
        }
        static count(query, count, action)
        {
            new SpinQuery(query, it => it.length === count, action).start();
        }
    }
    class ColorProcessor
    {
        constructor(hex)
        {
            this.hex = hex;
        }
        get rgb()
        {
            return this.hexToRgb(this.hex);
        }
        getHexRegex(alpha, shorthand)
        {
            const repeat = shorthand ? "" : "{2}";
            const part = `([a-f\\d]${repeat})`;
            const count = alpha ? 4 : 3;
            const pattern = `#?${part.repeat(count)}`;
            return new RegExp(pattern, "ig");
        }
        _hexToRgb(hex, alpha)
        {
            const isShortHand = hex.length < 6;
            if (isShortHand)
            {
                const shorthandRegex = this.getHexRegex(alpha, true);
                hex = hex.replace(shorthandRegex, function ()
                {
                    let result = "";
                    let i = 1;
                    while (arguments[i])
                    {
                        result += arguments[i].repeat(2);
                        i++;
                    }
                    return result;
                });
            }

            const regex = this.getHexRegex(alpha, false);
            const regexResult = regex.exec(hex);
            if (regexResult)
            {
                const color = {
                    r: parseInt(regexResult[1], 16),
                    g: parseInt(regexResult[2], 16),
                    b: parseInt(regexResult[3], 16)
                };
                if (regexResult[4])
                {
                    color.a = parseInt(regexResult[4], 16) / 255;
                }
                return color;
            }
            else if (alpha)
            {
                const rgb = this._hexToRgb(hex, false);
                if (rgb)
                {
                    rgb.a = 1;
                    return rgb;
                }
            }
            return null;
        }
        hexToRgb(hex)
        {
            return this._hexToRgb(hex, false);
        }
        hexToRgba(hex)
        {
            return this._hexToRgb(hex, true);
        }
        rgbToHsb(rgb)
        {
            const { r, g, b } = rgb;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            const s = Math.round((max === 0 ? 0 : delta / max) * 100);
            const v = Math.round(max / 255 * 100);

            let h;
            if (delta === 0)
            {
                h = 0;
            }
            else if (r === max)
            {
                h = (g - b) / delta % 6;
            }
            else if (g === max)
            {
                h = (b - r) / delta + 2;
            }
            else if (b === max)
            {
                h = (r - g) / delta + 4;
            }
            h = Math.round(h * 60);
            if (h < 0)
            {
                h += 360;
            }

            return { h: h, s: s, b: v };
        }
        get hsb()
        {
            return this.rgbToHsb(this.rgb);
        }
        get grey()
        {
            const color = this.rgb;
            return 1 - (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
        }
        get foreground()
        {
            const color = this.rgb;
            if (color && this.grey < 0.35)
            {
                return "#000";
            }
            return "#fff";
        }
        makeImageFilter(originalRgb)
        {
            const { h, s, b } = this.rgbToHsb(originalRgb);
            const targetColor = this.hsb;

            const hue = targetColor.h - h;
            const saturate = (s - targetColor.s) / 100 + 100;
            const brightness = (b - targetColor.b) / 100 + 100;
            const filter = `hue-rotate(${hue}deg) saturate(${saturate}%) brightness(${brightness}%)`;
            return filter;
        }
        get blueImageFilter()
        {
            const blueColor = {
                r: 0,
                g: 160,
                b: 213
            };
            return this.makeImageFilter(blueColor);
        }
        get pinkImageFilter()
        {
            const pinkColor = {
                r: 251,
                g: 113,
                b: 152
            };
            return this.makeImageFilter(pinkColor);
        }
        get brightness()
        {
            return `${this.foreground === "#000" ? "100" : "0"}%`;
        }
        get filterInvert()
        {
            return this.foreground === "#000" ? "" : "invert(1)";
        }
    }
    // [Offline build placeholder]
    class ResourceType
    {
        constructor(name, preprocessor)
        {
            this.name = name;
            this.preprocessor = preprocessor || (text => text);
        }
        static fromUrl(url)
        {
            if (url.indexOf(".scss") !== -1 || url.indexOf(".css") !== -1)
            {
                return this.style;
            }
            else if (url.indexOf(".html") !== -1 || url.indexOf(".htm") !== -1)
            {
                return this.html;
            }
            else if (url.indexOf(".js") !== -1)
            {
                return this.script;
            }
            else
            {
                return this.unknown;
            }
        }
        static get style()
        {
            return new ResourceType("style", style =>
            {
                const color = new ColorProcessor();
                const hexToRgba = text =>
                {
                    const replaceColor = (text, shorthand) =>
                    {
                        const part = `([a-f\\d]${shorthand ? "" : "{2}"})`.repeat(4);
                        return text.replace(new RegExp(`(#${part})[^a-f\\d]`, "ig"), (original, it) =>
                        {
                            const rgba = color.hexToRgba(it);
                            if (rgba)
                            {
                                return `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a})${original.slice(-1)}`;
                            }
                            else
                            {
                                return original;
                            }
                        });
                    };
                    return replaceColor(replaceColor(text, false), true);
                };
                for (const key of Object.keys(settings))
                {
                    style = style
                        .replace(new RegExp("\\$" + key, "g"), settings[key]);
                }
                return hexToRgba(style);
            });
        }
        static get html()
        {
            return new ResourceType("html", html =>
            {
                return html
                    .replace(/<category>([^\0]*?)<\/category>/g, `
                    <li class="indent-center">
                        <span class="settings-category">$1</span>
                    </li>
                `).replace(/<checkbox\s*indent="(.+)"\s*key="(.+)"\s*dependencies="(.*)">([^\0]*?)<\/checkbox>/g, `
                    <li class="indent-$1">
                        <label class="gui-settings-checkbox-container">
                            <input key="$2" type="checkbox" dependencies="$3"/>
                            <svg class="gui-settings-ok" viewBox="0 0 24 24">
                                <path />
                            </svg>
                            <span>$4</span>
                        </label>
                    </li>
                `);
            });
        }
        static get script()
        {
            return new ResourceType("script");
        }
        static get unknown()
        {
            return new ResourceType("unknown");
        }
    }
    class Resource
    {
        get downloaded()
        {
            return this.text !== null;
        }
        constructor(url, priority, dependencies)
        {
            this.url = Resource.root + url;
            this.dependencies = dependencies || [];
            this.priority = priority;
            this.text = null;
            this.type = ResourceType.fromUrl(url);
        }
        download()
        {
            return new Promise((resolve, reject) =>
            {
                if (this.downloaded)
                {
                    resolve(this.text);
                }
                else
                {
                    Promise.all(this.dependencies.map(r => r.download())).then(() =>
                    {
                        downloadText(this.url, text =>
                        {
                            this.text = this.type.preprocessor(text);
                            resolve(this.text);
                        }, error => reject(error));
                    });
                }
            });
        }
        applyStyle(id)
        {
            if ($(`#${id}`).length === 0)
            {
                const style = this.text;
                if (!style)
                {
                    console.error("Attempt to get style which is not downloaded.");
                }
                let attributes = `id='${id}'`;
                if (this.priority !== undefined)
                {
                    attributes += ` priority='${this.priority}'`;
                }
                const element = `<style ${attributes}>${style}</style>`;
                if (this.priority !== undefined)
                {
                    let insertPosition = this.priority - 1;
                    let formerStyle = $(`style[priority='${insertPosition}']`);
                    while (insertPosition >= 0 && formerStyle.length === 0)
                    {
                        formerStyle = $(`style[priority='${insertPosition}']`);
                        insertPosition--;
                    }
                    if (insertPosition < 0)
                    {
                        $("head").prepend(element);
                    }
                    else
                    {
                        formerStyle.after(element);
                    }
                }
                else
                {
                    $("head").prepend(element);
                }
            }
        }
    }
    Resource.root = "https://raw.githubusercontent.com/the1812/Bilibili-Evolved/master/";
    Resource.all = {
        style: new Resource("style/style.min.scss", 1),
        oldStyle: new Resource("style/style-old.min.scss", 1),
        darkStyleSlice1: new Resource("style/style-dark-slice-1.min.scss", 2),
        darkStyleSlice2: new Resource("style/style-dark-slice-2.min.scss", 2),
        touchPlayerStyle: new Resource("style/style-touch-player.min.scss", 3),
        navbarOverrideStyle: new Resource("style/style-navbar-override.min.css", 4),
        noBannerStyle: new Resource("style/style-no-banner.min.css", 5),
        removeAdsStyle: new Resource("style/style-remove-promotions.min.css", 6),
        guiSettingsStyle: new Resource("style/style-gui-settings.min.scss", 0),

        guiSettingsDom: new Resource("utils/gui-settings.html"),

        guiSettings: new Resource("utils/gui-settings.min.js"),
        useDarkStyle: new Resource("style/dark-styles.min.js"),
        useNewStyle: new Resource("style/new-styles.min.js"),
        touchNavBar: new Resource("touch/touch-navbar.min.js"),
        touchVideoPlayer: new Resource("touch/touch-player.min.js"),
        expandDanmakuList: new Resource("utils/expand-danmaku.min.js"),
        removeAds: new Resource("utils/remove-promotions.min.js"),
        watchLaterRedirect: new Resource("utils/watchlater.min.js"),
        hideTopSearch: new Resource("utils/hide-top-search.min.js"),
        harunaScale: new Resource("live/haruna-scale.min.js"),
        removeLiveWatermark: new Resource("live/remove-watermark.min.js"),
        fixFullscreen: new Resource("utils/fix-fullscreen.min.js")
    };
    (function ()
    {
        this.guiSettings.dependencies = [
            this.guiSettingsDom,
            this.guiSettingsStyle
        ];
        this.useDarkStyle.dependencies = [
            this.darkStyleSlice1,
            this.darkStyleSlice2
        ];
        this.useNewStyle.dependencies = [
            this.style,
            this.oldStyle,
            this.navbarOverrideStyle,
            this.noBannerStyle
        ];
        this.touchVideoPlayer.dependencies = [
            this.touchPlayerStyle
        ];
        this.removeAds.dependencies = [
            this.removeAdsStyle
        ];
    }).apply(Resource.all);
    class ResourceManager
    {
        constructor()
        {
            this.data = Resource.all;
            this.attributes = {};
            this.setupColors();
        }
        setupColors()
        {
            this.color = new ColorProcessor(settings.customStyleColor);
            settings.foreground = this.color.foreground;
            settings.blueImageFilter = this.color.blueImageFilter;
            settings.pinkImageFilter = this.color.pinkImageFilter;
            settings.brightness = this.color.brightness;
            settings.filterInvert = this.color.filterInvert;
        }
        fetch()
        {
            return new Promise(resolve =>
            {
                const promises = [];
                for (const key in settings)
                {
                    if (settings[key] === true)
                    {
                        const resource = Resource.all[key];
                        if (!resource)
                        {
                            continue;
                        }
                        const promise = resource.download();
                        promise.then(text =>
                        {
                            const func = eval(text);
                            if (func)
                            {
                                const attribute = func(settings, this);
                                this.attributes[key] = attribute;
                                if (attribute.ajaxReload)
                                {
                                    $(document).ajaxComplete(() =>
                                    {
                                        func(settings, this);
                                    });
                                }
                            }
                        });
                        promises.push(promise);
                    }
                }
                Promise.all(promises).then(() => resolve());
            });
        }
        applyStyle(key, id)
        {
            Resource.all[key].applyStyle(id);
        }
    }

    loadSettings();
    const resources = new ResourceManager();
    resources.fetch();
})(window.jQuery.noConflict(true));