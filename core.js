/*
 jQuery throttle / debounce - v1.1 - 3/7/2010
 http://benalman.com/projects/jquery-throttle-debounce-plugin/

 Copyright (c) 2010 "Cowboy" Ben Alman
 Dual licensed under the MIT and GPL licenses.
 http://benalman.com/about/license/
*/
(function(window, undefined) {
    var $jscomp$this = this;
    function MessageChannel(group, targetWindow, targetOrigin) {
        if (targetOrigin === "*")
            throw new Error("MessageChannel does not support '*' targetOrigin parameter.");
        this._msgNo = 1;
        this._group = group;
        this._targetOrigin = targetOrigin || null;
        this._requestHandler = {};
        this._messageQueue = {};
        this._targetWindow = targetWindow || window.parent;
        this._receiveMessage = receiveMessage.bind(this);
        window.addEventListener("message", this._receiveMessage, false)
    }
    MessageChannel.prototype.destroy = function() {
        window.removeEventListener("message", $jscomp$this._receiveMessage, false)
    }
    ;
    MessageChannel.prototype.subscribeRequestMessage = function(msg, callback) {
        this._requestHandler[msg] = this._requestHandler[msg] || [];
        this._requestHandler[msg].push(callback)
    }
    ;
    MessageChannel.prototype.unsubscribeRequestMessage = function(msg, callback) {
        var idx = this._requestHandler[msg].indexOf(callback);
        this._requestHandler[msg].splice(idx, 1)
    }
    ;
    MessageChannel.prototype.postMessage = function(msg, data, timeout) {
        var self = this;
        var msgObj = {
            "id": this._msgNo++,
            "group": this._group,
            "type": "request",
            "msg": msg,
            "data": data || {}
        };
        var pRes, pRej;
        var p = new Promise(function(resolve, reject) {
            pRes = resolve;
            pRej = reject
        }
        );
        p.resolve = pRes;
        p.reject = pRej;
        this._messageQueue[msgObj.id] = msgObj;
        this._targetWindow.postMessage(msgObj, this._targetOrigin);
        msgObj.promise = p;
        if (timeout) {
            if (timeout < 0) {
                this._messageQueue[msgObj.id] = null;
                return
            }
            setTimeout(function() {
                self._messageQueue[msgObj.id] = null;
                p.reject({
                    error: "timeout",
                    req: msgObj
                })
            }, timeout)
        }
        return p
    }
    ;
    function receiveMessage(event) {
        var self = this;
        if (event.origin !== location.origin) {
            console.error("Target origin " + event.origin + " does not match expected origin " + location.origin);
            return
        }
        var req = event.data;
        if (req.group !== this._group)
            return;
        if (req.type === "response" && this._messageQueue[req.id]) {
            this._messageQueue[req.id].promise[req.error ? "reject" : "resolve"]({
                error: req.error,
                req: this._messageQueue[req.id],
                res: req
            });
            this._messageQueue[req.id] = null
        } else if (req.type === "request") {
            var cb = this._requestHandler[req.msg];
            if (cb) {
                req.respond = function(msg, data, error) {
                    this.respond = function() {}
                    ;
                    var msgObj = {
                        "id": this.id,
                        "group": self._group,
                        "type": "response",
                        "error": error,
                        "msg": msg,
                        "data": data || {}
                    };
                    self._targetWindow.postMessage(msgObj, self._targetOrigin)
                }
                ;
                for (var i = 0; i < cb.length; i++)
                    cb[i](req)
            }
        }
    }
    MessageChannel.prototype.mixin = function(obj) {
        Granite.author.util.deprecated();
        obj.subscribeRequestMessage = this.subscribeRequestMessage.bind(this);
        obj.unsubscribeRequestMessage = this.unsubscribeRequestMessage.bind(this);
        obj.postMessage = this.postMessage.bind(this);
        return obj
    }
    ;
    window.Granite = window.Granite || {};
    window.Granite.author = window.Granite.author || {};
    window.Granite.author.MessageChannel = MessageChannel
}
)(this);
(function(document, Coral, $, ns) {
    var overlay;
    var wizardview;
    var highlight;
    var $highlight;
    var popover;
    var $popover;
    var currentLayer;
    var hasCoachMark = !!Coral.CoachMark;
    var findStepTarget = function() {
        var step = wizardview.panelStacks.getAll()[0].selectedItem;
        var targetEl = document.querySelector(step.dataset.graniteShellOnboardingStepTarget);
        if (targetEl) {
            if (hasCoachMark) {
                highlight.hidden = false;
                highlight.target = targetEl
            } else {
                var dim = $(targetEl).outerWidth() - 2;
                $highlight.width(dim).removeClass("is-hidden");
                setTimeout(function() {
                    $highlight.position({
                        my: "left top",
                        at: "left top",
                        of: targetEl,
                        collision: "none"
                    })
                }, 100)
            }
            requestAnimationFrame(function() {
                $popover.position({
                    my: "left top",
                    at: "right+15 top",
                    of: targetEl,
                    collision: "flipfit"
                })
            })
        } else {
            if (hasCoachMark)
                highlight.hidden = true;
            else
                $highlight.addClass("is-hidden");
            requestAnimationFrame(function() {
                $popover.position({
                    my: "center",
                    at: "center",
                    of: window,
                    collision: "none"
                })
            })
        }
    };
    var saveOpenAgainState = function(openAgain) {
        var prefName = overlay.dataset.graniteShellOnboardingPrefname;
        var prefAPI = $(window).adaptTo("foundation-preference");
        prefAPI.set(prefName, openAgain)
    };
    var closeOnBoarding = function(forceDismiss) {
        if (forceDismiss || overlay.querySelector(".granite-shell-onboarding-checkbox").hasAttribute("checked"))
            saveOpenAgainState(false);
        if (overlay) {
            overlay.removeAttribute("open");
            overlay.off("coral-wizardview:change", findStepTarget)
        }
        if (highlight)
            $highlight.remove();
        if (ns.EditorFrame.editableToolbar)
            ns.EditorFrame.editableToolbar.close();
        ns.selection.deselectAll();
        ns.selection.deactivateCurrent();
        var targetLayer = ns.layerManager.getCurrentLayerName();
        if (currentLayer !== targetLayer)
            ns.layerManager.activateLayer(currentLayer)
    };
    var closeIfOverlay = function(event) {
        if (event.target === overlay)
            closeOnBoarding()
    };
    var openOnBoarding = function() {
        var triggerElement = document.querySelector(".granite-shell-onboarding-src");
        if (!triggerElement)
            return;
        var url = triggerElement.dataset.graniteShellOnboardingSrc;
        if (!url)
            return;
        $.ajax({
            url: url,
            cache: false
        }).then(function(html) {
            var parser = $(window).adaptTo("foundation-util-htmlparser");
            parser.parse(html).then(function(fragment) {
                var $el = $(fragment).children();
                var checkBoxShowNotAgain;
                $("body").append($el).trigger("foundation-contentloaded");
                overlay = $el[0];
                overlay.setAttribute("open", true);
                overlay.querySelector(".granite-shell-onboarding-panelstack \x3e coral-panel:first-child").setAttribute("selected", "");
                wizardview = overlay.querySelector("coral-wizardview");
                checkBoxShowNotAgain = overlay.querySelector(".granite-shell-onboarding-checkbox");
                if (checkBoxShowNotAgain) {
                    checkBoxShowNotAgain.setAttribute("checked", "");
                    $(checkBoxShowNotAgain).on("change", function() {
                        saveOpenAgainState(!this.checked)
                    })
                }
                popover = overlay.querySelector(".granite-shell-onboarding-popover");
                $popover = $(popover);
                if (hasCoachMark) {
                    highlight = document.createElement("coral-coachmark");
                    highlight.setAttribute("variant", "light")
                } else {
                    highlight = document.createElement("div");
                    highlight.className = "granite-shell-onboarding-highlight"
                }
                $highlight = $(highlight);
                document.body.appendChild(highlight);
                Coral.commons.ready(overlay, function() {
                    $(window).on("resize", findStepTarget);
                    var zIndex = hasCoachMark ? $(overlay).css("zIndex") + 1 : $(overlay).css("zIndex") - 1;
                    $highlight.css("zIndex", zIndex);
                    overlay.on("coral-wizardview:change", findStepTarget);
                    overlay.on("click", ".granite-shell-onboarding-done", function() {
                        closeOnBoarding(true)
                    });
                    overlay.on("click", "[coral-close]", function(event) {
                        closeOnBoarding()
                    });
                    overlay.on("click", closeIfOverlay);
                    overlay.on("coral-overlay:close", closeIfOverlay);
                    findStepTarget()
                })
            })
        })
    };
    $(document).on("editor-show-onboarding", function(event) {
        currentLayer = ns.layerManager.getCurrentLayerName();
        var targetLayer = event.targetLayer;
        if (currentLayer !== targetLayer)
            ns.layerManager.activateLayer(targetLayer);
        if (overlay)
            overlay.open = true;
        else
            openOnBoarding()
    })
}
)(document, Coral, Granite.$, Granite.author);
(function($, ns, channel, window, undefined) {
    ns.editor = {
        registry: {},
        register: function(name, editor) {
            this.registry[name] = editor
        },
        startEditor: function(name, editable) {
            if (this.registry[name])
                this.registry[name].setUp(editable)
        },
        endEditor: function(name, editable) {
            if (this.registry[name])
                this.registry[name].tearDown(editable)
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var PLUGIN_CONFIG_ALL_FEATURES = "*";
    var PLUGIN_CONFIG_NO_FEATURES = "-";
    var AUTHOR_IMAGE_SELECTOR = ".cq-dd-image";
    function parseConfigValue(value) {
        if (value.indexOf(",") > 0)
            value = value.split(",");
        if (!$.isArray(value))
            value = [value];
        return value
    }
    var ui = {};
    var Editor = new Class({
        extend: CUI.ImageEditor,
        switchToInline: function() {
            this.options.parent.append(this.$ui);
            ns.editor.fullscreenController.finish();
            return this.inherited(arguments)
        },
        switchToFullscreen: function() {
            var cont = ns.editor.fullscreenController.start();
            cont.append(this.$ui);
            return this.inherited(arguments)
        },
        setupEventHandling: function() {
            var self = this;
            this.options.parent.on("click.imageeditor-ooa", function(e) {
                self.finish()
            });
            return this.inherited(arguments)
        },
        destroyEventHandling: function() {
            this.options.parent.off("click.imageeditor-ooa");
            return this.inherited(arguments)
        },
        destroyUI: function() {
            var result = this.inherited(arguments);
            ns.editor.fullscreenController.finish();
            return result
        },
        focus: function() {
            var toolbar = this.options.mode ? this.toolbars[this.options.mode] : this.toolbars.inline;
            toolbar.$toolbars.first(":not(.u-coral-hidden)").find('button:not([disabled]):not([tabindex\x3d"-1"])').first().focus()
        }
    });
    ns.editor.ImageEditor = function() {
        var self = this;
        channel.on("inline-edit-start", function(e) {
            var editable = e.editable;
            self.startImageEditor(editable)
        })
    }
    ;
    ns.editor.ImageEditor.PluginMixins = {};
    ns.editor.ImageEditor.prototype.setUp = function(editable, dropTargetId) {
        this.startImageEditor(editable, dropTargetId)
    }
    ;
    ns.editor.ImageEditor.prototype.tearDown = function(editable) {
        this.endImageEditor(editable)
    }
    ;
    ns.editor.ImageEditor.prototype.startImageEditor = function(editable, dropTargetId) {
        var self = this;
        var wcmProperties = {};
        var classicConfig = {};
        var options = {};
        var originalImage;
        var ipeConfig = editable.config && editable.config.ipeConfig ? self.formatIpeConfig(editable.config.ipeConfig) : {};
        ipeConfig = dropTargetId ? ipeConfig[dropTargetId] || {} : ipeConfig;
        if (editable.dom.has(".cq-dd-" + dropTargetId + ".cq-placeholder").length === 1)
            return;
        ns.history.Manager.setBlocked(true);
        channel.trigger("cq-hide-overlays");
        channel.trigger("inline-edit-before-start");
        ui[editable.path] = $("\x3cdiv class\x3d'cq-imageeditor-ui'\x3e\x3c/div\x3e");
        $("#InlineEditingUI").append(ui[editable.path]).show();
        self.loadRendition(editable, dropTargetId).then(function(oImageAndData) {
            originalImage = oImageAndData[0];
            wcmProperties = oImageAndData[1]
        }).then(function() {
            self.loadClassicDialogConfig(editable, function(data) {
                if (data.items && data.items.image)
                    classicConfig = self.classicConfigToCUIConfig(ns.configCleaner(data.items.image))
            }).always(function() {
                options = $.extend(true, {}, ns.editor.ImageEditor.defaults, classicConfig);
                for (var key in ipeConfig.plugins)
                    if (ipeConfig.plugins.hasOwnProperty(key)) {
                        var features = ipeConfig.plugins[key].features;
                        if (features && features.length > 0 && features !== PLUGIN_CONFIG_ALL_FEATURES && features !== PLUGIN_CONFIG_NO_FEATURES)
                            ipeConfig.plugins[key].features = parseConfigValue(features)
                    }
                options.plugins = Granite.Util.applyDefaults({}, options.plugins, ipeConfig.plugins);
                options.ui = Granite.Util.applyDefaults({}, options.ui, ipeConfig.ui);
                var $image = dropTargetId ? editable.dom.find(".cq-dd-" + dropTargetId) : editable.dom.find(AUTHOR_IMAGE_SELECTOR);
                var width = 0;
                if ($image.length !== 0) {
                    var image = $image[0];
                    var containerWidth = 0;
                    var container = image;
                    while (containerWidth === 0 && container !== editable.dom[0]) {
                        container = container.parentElement;
                        containerWidth = container.clientWidth
                    }
                    width = containerWidth < image.clientWidth ? containerWidth : image.clientWidth
                } else
                    width = editable.dom[0].clientWidth;
                var sizeOptions = {
                    naturalHeight: originalImage.naturalHeight,
                    naturalWidth: originalImage.naturalWidth,
                    width: width
                };
                $.extend(options, sizeOptions);
                options.result = self.fromWCMtoCUI(editable, sizeOptions, wcmProperties);
                var componentOptions = $.extend({
                    element: $image,
                    image: originalImage,
                    parent: ui[editable.path],
                    theme: "dark"
                }, sizeOptions);
                self.checkFeaturesForSupportedMimeTypes(options, wcmProperties);
                var editor = new Editor(componentOptions);
                editor.start(options);
                editable.dom.one("editing-finished", function(e, content) {
                    self.onFinishEditing(editable, sizeOptions, content, dropTargetId)
                });
                editable.dom.one("editing-cancelled", function(e, content) {
                    self.onCancelEditing(editable)
                });
                self.startData = self.fromCUItoWCM(editable, sizeOptions, options, dropTargetId);
                editor.focus()
            })
        }).fail(function() {
            var msg;
            if (arguments.length > 0 && typeof arguments[0] === "string")
                msg = Granite.I18n.get("Sorry, could not start image editor:") + " " + Granite.I18n.get(arguments[0]);
            else
                msg = Granite.I18n.get("Sorry, image editor could not start.");
            ns.ui.helpers.notify({
                content: msg,
                type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
            });
            self.onCancelEditing(editable)
        })
    }
    ;
    ns.editor.ImageEditor.prototype.addHistoryStep = function(editable, sizeOptions, properties, dropTargetId) {
        var key, self = this, originalData = {}, changedData = this.fromCUItoWCM(editable, sizeOptions, properties, dropTargetId), hasChanged = false;
        if (editable) {
            for (key in self.startData)
                if (self.startData.hasOwnProperty(key) && key.indexOf("image") !== -1)
                    originalData[key] = self.startData[key];
            for (key in changedData)
                if (originalData.hasOwnProperty(key) && originalData[key] !== changedData[key]) {
                    hasChanged = true;
                    break
                }
            if (hasChanged)
                ns.history.util.Utils.addUpdateParagraphStep(editable.path, editable.type, originalData, changedData)
        }
    }
    ;
    ns.editor.ImageEditor.prototype.endImageEditor = function(editable) {
        ui[editable.path].remove();
        delete ui[editable.path];
        $("#InlineEditingUI").hide();
        ns.history.Manager.setBlocked(false)
    }
    ;
    ns.editor.ImageEditor.prototype.updateProperties = function(editable, sizeOptions, properties, dropTargetId) {
        var self = this;
        editable.refresh().then(function() {
            ns.overlayManager.recreate(editable);
            ns.selection.select(editable);
            ns.edit.EditableActions.UPDATE.execute(editable, self.fromCUItoWCM(editable, sizeOptions, properties, dropTargetId)).always(function(e) {
                channel.trigger($.Event("inline-edit-finish", {
                    editable: editable,
                    properties: properties
                }));
                channel.trigger("cq-show-overlays")
            })
        })
    }
    ;
    ns.editor.ImageEditor.prototype.loadRendition = function(editable, dropTargetId) {
        var self = this;
        var path = editable.path;
        var prefix = this.getImagePrefix(editable, dropTargetId);
        var fileReference = "fileReference";
        var filePathSuffix = "/file";
        if (prefix)
            path += "/" + prefix;
        return $.getJSON(path + ".json").then(function(data) {
            if (data.hasOwnProperty(fileReference)) {
                path = data[fileReference];
                return self.getMimeType(path + "/jcr:content/metadata").then(function(mimeType) {
                    data.mimeType = mimeType;
                    return self.loadWebRendition(path).then(function(webRenditionPath) {
                        if (webRenditionPath)
                            path = webRenditionPath;
                        return self.loadImage(path).then(function(img) {
                            return [img, data]
                        })
                    })
                })
            } else {
                path = path + filePathSuffix;
                return self.getMimeType(path + "/jcr:content").then(function(mimeType) {
                    data.mimeType = mimeType;
                    return self.loadImage(path).then(function(img) {
                        return [img, data]
                    })
                })
            }
        })
    }
    ;
    ns.editor.ImageEditor.prototype.loadWebRendition = function(path) {
        var RENDITIONS_PATH = "/jcr:content/renditions"
          , WEB_RENDITION_PREFIX = "cq5dam.web"
          , requestPath = path + RENDITIONS_PATH + ".1.json";
        return $.getJSON(requestPath).then(function(renditionsData) {
            var webRenditionPath = null;
            for (var prop in renditionsData)
                if (renditionsData.hasOwnProperty(prop))
                    if (prop.indexOf(WEB_RENDITION_PREFIX) === 0) {
                        webRenditionPath = path + RENDITIONS_PATH + "/" + prop;
                        break
                    }
            return webRenditionPath
        }, function() {
            return "Expecting DAM asset to have renditions, but request to " + requestPath + " failed"
        })
    }
    ;
    ns.editor.ImageEditor.prototype.getMimeType = function(path) {
        var PN_MIME_TYPE = "jcr:mimeType"
          , PN_DC_FORMAT = "dc:format"
          , requestPath = path + ".json";
        return $.getJSON(requestPath).then(function(contentData) {
            var mimeType = null;
            if (contentData.hasOwnProperty(PN_MIME_TYPE))
                mimeType = contentData[PN_MIME_TYPE];
            else if (contentData.hasOwnProperty(PN_DC_FORMAT))
                mimeType = contentData[PN_DC_FORMAT];
            return mimeType
        }, function() {
            return "Could not load mimeType information of image resource, request to " + requestPath + " failed"
        })
    }
    ;
    ns.editor.ImageEditor.prototype.loadClassicDialogConfig = function(editable, callback) {
        var self = this, configPath;
        if (editable.config && editable.config.dialogClassic) {
            configPath = editable.config.dialogClassic;
            return $.getJSON(configPath + ".infinity" + ".json", function(data) {
                if (callback)
                    callback.call(self, data)
            })
        } else
            return $.Deferred().reject().promise()
    }
    ;
    ns.editor.ImageEditor.prototype.onFinishEditing = function(editable, sizeOptions, properties, dropTargetId) {
        this.endImageEditor(editable);
        this.updateProperties(editable, sizeOptions, properties, dropTargetId);
        this.addHistoryStep(editable, sizeOptions, properties, dropTargetId)
    }
    ;
    ns.editor.ImageEditor.prototype.onCancelEditing = function(editable) {
        this.endImageEditor(editable);
        editable.refresh().then(function() {
            editable.afterEdit();
            var editableParent = ns.editables.getParent(editable);
            editableParent && editableParent.afterChildEdit(editable);
            ns.overlayManager.recreate(editable);
            ns.selection.select(editable)
        });
        channel.trigger($.Event("inline-edit-cancel", {
            editable: editable
        }));
        channel.trigger("cq-show-overlays")
    }
    ;
    ns.editor.ImageEditor.prototype.loadImage = function(path, callback) {
        var POLL_INTERVAL = 100, triggered = false, self = this, img, cont, pollForLoad, onLoad, start = (new Date).getTime(), WARN_DELAY_MS = 5 * 1E3, warnedLast = start, ERROR_DELAY_MS = 30 * 1E3, timeoutReference = null, deferred = $.Deferred();
        pollForLoad = function() {
            var now = (new Date).getTime();
            if (img.get(0).naturalWidth)
                onLoad();
            else {
                if (now - warnedLast > WARN_DELAY_MS) {
                    ns.ui.helpers.notify({
                        content: Granite.I18n.get("Loading image since {0} seconds. Will abort after {1} seconds.", [Math.floor((now - start) / 1E3), ERROR_DELAY_MS / 1E3]),
                        type: ns.ui.helpers.NOTIFICATION_TYPES.INFO
                    });
                    warnedLast = now
                }
                if (now - start > ERROR_DELAY_MS)
                    return deferred.reject(Granite.I18n.get("Image did not load (timeout after {0} seconds).", [ERROR_DELAY_MS / 1E3]));
                else
                    timeoutReference = setTimeout(pollForLoad, POLL_INTERVAL)
            }
        }
        ;
        onLoad = function() {
            if (triggered)
                return;
            triggered = true;
            if (timeoutReference) {
                clearTimeout(timeoutReference);
                timeoutReference = null
            }
            cont.remove();
            deferred.resolveWith(self, img)
        }
        ;
        var imgSrc = Granite.HTTP.externalize(path);
        imgSrc += imgSrc.indexOf("?") > -1 ? "\x26" : "?";
        imgSrc += "cq_ck\x3d" + (new Date).getTime();
        img = $("\x3cimg\x3e", {
            src: imgSrc
        });
        cont = $("\x3cdiv\x3e").css({
            position: "absolute",
            left: "-1000000px"
        });
        cont.append(img).appendTo("body");
        img.on("load", onLoad);
        pollForLoad();
        return deferred.promise()
    }
    ;
    ns.editor.ImageEditor.prototype.fromWCMtoCUI = function(editable, sizeOptions, properties) {
        var result = []
          , self = this
          , registeredPlugins = {};
        sizeOptions = $.extend({}, sizeOptions);
        this.iteratePluginsForStaticUse(function(pluginName, plugin) {
            registeredPlugins[pluginName] = plugin
        });
        if (registeredPlugins.rotate)
            registeredPlugins.rotate.fromWCMtoCUI(this, editable, sizeOptions, properties, result);
        if (registeredPlugins.crop)
            registeredPlugins.crop.fromWCMtoCUI(this, editable, sizeOptions, properties, result);
        this.iteratePluginsForStaticUse(function(pluginName, plugin) {
            if (["crop", "rotate"].indexOf(pluginName) >= 0)
                return;
            if (plugin.fromWCMtoCUI)
                plugin.fromWCMtoCUI(self, editable, sizeOptions, properties, result)
        });
        return result
    }
    ;
    ns.editor.ImageEditor.prototype.fromCUItoWCM = function(editable, sizeOptions, properties, dropTargetId) {
        var i, registeredPlugins = null, result = {}, prefix = this.getImagePrefix(editable, dropTargetId);
        sizeOptions = $.extend({}, sizeOptions);
        registeredPlugins = CUI.imageeditor.plugins.PluginRegistry.createRegisteredPlugins(this);
        if (registeredPlugins.rotate)
            registeredPlugins.rotate.fromCUItoWCM(this, editable, sizeOptions, properties, result);
        if (registeredPlugins.crop)
            registeredPlugins.crop.fromCUItoWCM(this, editable, sizeOptions, properties, result);
        for (i = 0; i < properties.result.length; i++) {
            var transformation = properties.result[i];
            switch (transformation.transformation) {
            case "crop":
                break;
            case "rotate":
                break;
            default:
                if (registeredPlugins[transformation.transformation] && registeredPlugins[transformation.transformation].fromCUItoWCM)
                    registeredPlugins[transformation.transformation].fromCUItoWCM(this, editable, sizeOptions, properties, result)
            }
        }
        if (prefix) {
            prefix = prefix + "/";
            for (var prop in result)
                if (result.hasOwnProperty(prop)) {
                    result[prefix + prop] = result[prop];
                    delete result[prop]
                }
            result[prefix + "jcr:lastModified"] = null;
            result[prefix + "jcr:lastModifiedBy"] = null
        }
        return result
    }
    ;
    ns.editor.ImageEditor.prototype.getImagePrefix = function(editable, dropTargetId) {
        if (!(editable && editable.dropTargets))
            return "";
        var imageIdDropTarget = null;
        for (var i = 0; i < editable.dropTargets.length; i++) {
            var current = editable.dropTargets[i];
            if (current.accept && current.accept.length === 1 && current.accept[0] === "image/.*") {
                imageIdDropTarget = current;
                if (dropTargetId !== null && dropTargetId !== undefined && dropTargetId === current.id)
                    break;
                else if (dropTargetId === null || dropTargetId === undefined)
                    break
            }
        }
        var name = null;
        if (imageIdDropTarget)
            name = imageIdDropTarget.name;
        var retval = "";
        if (name) {
            var pathParts = name.split("/");
            if (pathParts.length > 1) {
                pathParts.splice(pathParts.length - 1);
                retval = pathParts.join("/")
            }
        }
        return retval
    }
    ;
    ns.editor.ImageEditor.prototype.extractTransformations = function(transformationResults, transformationType) {
        var retval = [];
        for (var i = 0; i < transformationResults.length; i++) {
            var current = transformationResults[i];
            if (current.transformation === transformationType)
                retval.push(current)
        }
        return retval
    }
    ;
    ns.editor.ImageEditor.prototype.checkFeaturesForSupportedMimeTypes = function(options, wcmProperties) {
        var PN_SUPPORTED_MIME_TYPES = "supportedMimeTypes"
          , mimeType = wcmProperties.mimeType;
        if (options.plugins)
            for (var plugin in options.plugins)
                if (options.plugins.hasOwnProperty(plugin))
                    if (options.plugins[plugin].hasOwnProperty(PN_SUPPORTED_MIME_TYPES)) {
                        var mimeTypes = options.plugins[plugin][PN_SUPPORTED_MIME_TYPES];
                        var enableFeatures = mimeTypes.some(function(allowedMimeType) {
                            return allowedMimeType === mimeType || allowedMimeType === "*" || (new RegExp(allowedMimeType)).test(mimeType)
                        });
                        if (!enableFeatures)
                            options.plugins[plugin].features = PLUGIN_CONFIG_NO_FEATURES
                    }
    }
    ;
    ns.editor.ImageEditor.prototype.classicConfigToCUIConfig = function(classicConfig) {
        var self = this
          , pluginsConfig = {}
          , config = {};
        this.iteratePluginsForStaticUse(function(pluginName, plugin) {
            if (plugin.classicConfigToCoralConfig)
                pluginsConfig[pluginName] = plugin.classicConfigToCoralConfig(self, classicConfig)
        });
        config.plugins = pluginsConfig;
        return config
    }
    ;
    ns.editor.ImageEditor.prototype.formatIpeConfig = function(ipeConfig) {
        var self = this
          , config = $.extend(true, {}, ipeConfig);
        if (config.plugins)
            this.iteratePluginsForStaticUse(function(pluginName, plugin) {
                var pluginConfig = config.plugins[pluginName];
                if (pluginConfig && plugin.formatIpeConfig)
                    config.plugins[pluginName] = plugin.formatIpeConfig(self, pluginConfig)
            });
        if (config.ui)
            if (config.ui.fullscreen) {
                if (config.ui.fullscreen.toolbar) {
                    $.each(config.ui.fullscreen.toolbar, function(key, value) {
                        config.ui.fullscreen.toolbar[key] = parseConfigValue(value)
                    });
                    config.ui.fullscreen.toolbar = self.ipeArrayToJsArray(config.ui.fullscreen.toolbar)
                }
                if (config.ui.fullscreen.replacementToolbars)
                    $.each(config.ui.fullscreen.replacementToolbars, function(key, value) {
                        $.each(config.ui.fullscreen.replacementToolbars[key], function(k, v) {
                            config.ui.fullscreen.replacementToolbars[key][k] = parseConfigValue(v)
                        });
                        config.ui.fullscreen.replacementToolbars[key] = self.ipeArrayToJsArray(value)
                    })
            }
        return config
    }
    ;
    ns.editor.ImageEditor.prototype.ipeArrayToJsArray = function(obj) {
        var key, retval = [];
        if ($.isArray(obj))
            return obj;
        for (key in obj)
            if (obj.hasOwnProperty(key))
                retval.push(obj[key]);
        return retval
    }
    ;
    ns.editor.ImageEditor.prototype.canEdit = function(editable) {
        return editable.dom.find(AUTHOR_IMAGE_SELECTOR + ":not(.cq-placeholder)").length
    }
    ;
    ns.editor.ImageEditor.prototype.iteratePluginsForStaticUse = function(callback) {
        var pluginName;
        if (!this.registeredPlugins)
            this.registeredPlugins = CUI.imageeditor.plugins.PluginRegistry.createRegisteredPlugins(this);
        for (pluginName in this.registeredPlugins)
            if (this.registeredPlugins.hasOwnProperty(pluginName))
                callback(pluginName, this.registeredPlugins[pluginName])
    }
    ;
    ns.editor.ImageEditor.defaults = {
        "ui": {
            "inline": {
                "toolbar": ["crop#launch", "rotate#right", "history#undo", "history#redo", "fullscreen#fullscreen", "control#close", "control#finish"],
                "replacementToolbars": {
                    "crop": ["crop#identifier", "crop#unlaunch", "crop#confirm"]
                }
            },
            "fullscreen": {
                "toolbar": [["crop#launchwithratio", "rotate#right", "map#launch", "zoom#reset100", "zoom#popupslider"], ["history#undo", "history#redo", "fullscreen#fullscreenexit"]],
                "replacementToolbars": {
                    "crop": [["crop#identifier"], ["crop#unlaunch", "crop#confirm"]],
                    "map": [["map#rectangle", "map#circle", "map#polygon"], ["map#unlaunch", "map#confirm"]]
                }
            }
        },
        plugins: {
            crop: {
                features: "*"
            },
            map: {
                features: "*",
                pathbrowser: {
                    type: "picker",
                    rootPath: "/content",
                    showTitles: false,
                    optionLoader: function(path, callback) {
                        jQuery.get(path + ".pages.json", {
                            predicate: "hierarchyNotFile"
                        }, function(data) {
                            var pages = data.pages;
                            var result = [];
                            for (var i = 0; i < pages.length; i++)
                                result.push(pages[i].label);
                            if (callback)
                                callback(result)
                        }, "json");
                        return false
                    },
                    optionLoaderRoot: null,
                    optionValueReader: function(object) {
                        return "" + object
                    },
                    optionTitleReader: function(object) {
                        return "" + object
                    },
                    pickerSrc: "/libs/wcm/core/content/common/pathbrowser/column.html" + "/content" + "?predicate\x3dhierarchyNotFile",
                    pickerTitle: "Choose a target path",
                    picketCrumbRoot: {
                        title: "Content Root",
                        icon: "coral-Icon-home"
                    }
                }
            },
            rotate: {
                features: "*"
            }
        }
    };
    ns.editor.register("image", new ns.editor.ImageEditor)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.editor.ImageEditor.PluginMixins.Rotate = new Class({
        toString: "Rotate",
        extend: CUI.imageeditor.plugins.Rotate,
        fromWCMtoCUI: function(editor, editable, sizeOptions, properties, result) {
            var tmp = 0
              , rotation = null;
            if (properties.hasOwnProperty("imageRotate")) {
                tmp = parseInt(properties.imageRotate, 10);
                if (!isNaN(tmp)) {
                    tmp = tmp % 360;
                    tmp = tmp + 360;
                    tmp = tmp % 360;
                    result.push({
                        transformation: "rotate",
                        angle: tmp
                    });
                    rotation = tmp
                }
            }
            sizeOptions.rotation = rotation
        },
        fromCUItoWCM: function(editor, editable, sizeOptions, properties, result) {
            result.imageRotate = null;
            var rotation = this.extractRotation(editor, properties.result);
            if (rotation !== null) {
                sizeOptions.rotation = rotation;
                result.imageRotate = "" + rotation
            }
        },
        extractRotation: function(editor, transformationResults) {
            var matches = editor.extractTransformations(transformationResults, "rotate");
            if (matches.length > 0) {
                var tmp = parseInt(matches[0].angle, 10);
                if (!isNaN(tmp)) {
                    tmp = tmp % 360;
                    tmp = tmp + 360;
                    tmp = tmp % 360;
                    return tmp
                }
            }
            return null
        },
        classicConfigToCoralConfig: function(editor, config) {
            var rotateConf = {};
            rotateConf.features = config.rotateParameter && $.trim(config.rotateParameter).length ? "*" : "-";
            return rotateConf
        }
    });
    CUI.imageeditor.plugins.PluginRegistry.register("rotate", ns.editor.ImageEditor.PluginMixins.Rotate)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.editor.ImageEditor.PluginMixins.Crop = new Class({
        toString: "Crop",
        extend: CUI.imageeditor.plugins.Crop,
        fromWCMtoCUI: function(editor, editable, sizeOptions, properties, result) {
            var tmp, cropOnOriginal = null;
            if (properties.hasOwnProperty("imageCrop") && properties.imageCrop) {
                tmp = properties.imageCrop.split(",");
                if (tmp.length === 4) {
                    tmp = $.map(tmp, function(str) {
                        return parseInt(str, 10)
                    });
                    cropOnOriginal = {
                        transformation: "crop",
                        left: tmp[0],
                        top: tmp[1],
                        width: tmp[2] - tmp[0],
                        height: tmp[3] - tmp[1]
                    };
                    result.push(cropOnOriginal)
                }
            }
            if (cropOnOriginal !== null)
                sizeOptions.cropOnOriginal = cropOnOriginal;
            return result
        },
        fromCUItoWCM: function(editor, editable, sizeOptions, properties, result) {
            result.imageCrop = null;
            var cropOnOriginal = this.extractCropOnOriginal(editor, properties.result);
            if (cropOnOriginal !== null)
                sizeOptions.cropOnOriginal = cropOnOriginal;
            var sizeHelper = new CUI.imageeditor.TranslationUtil(sizeOptions);
            var naturalDims = sizeHelper.getNaturalDimensionsBeforeRotation();
            cropOnOriginal = sizeHelper.getCropOnOriginal();
            if (cropOnOriginal.width !== naturalDims.width || cropOnOriginal.height !== naturalDims.height)
                result.imageCrop = [Math.round(cropOnOriginal.left), Math.round(cropOnOriginal.top), Math.round(cropOnOriginal.left + cropOnOriginal.width), Math.round(cropOnOriginal.top + cropOnOriginal.height)].join(",")
        },
        extractCropOnOriginal: function(editor, transformationResults) {
            var matches = editor.extractTransformations(transformationResults, "crop");
            if (matches.length > 0)
                return matches[0];
            return null
        },
        classicConfigToCoralConfig: function(editor, config) {
            var classicRatioToCUIRatio, cropConf = {}, aspectRatio = {}, cuiAspectRatio = null;
            cropConf.features = config.cropParameter && $.trim(config.cropParameter).length ? "*" : "-";
            classicRatioToCUIRatio = function(ratio) {
                var vals = ratio.split(",")
                  , res = null;
                if (vals.length === 2)
                    res = parseInt(vals[0], 10) / parseInt(vals[1], 10);
                return res
            }
            ;
            if (config && config.aspectRatios)
                for (var key in config.aspectRatios)
                    if (config.aspectRatios.hasOwnProperty(key)) {
                        if (!cropConf.aspectRatios)
                            cropConf.aspectRatios = [];
                        aspectRatio = config.aspectRatios[key];
                        cuiAspectRatio = {};
                        cuiAspectRatio.name = aspectRatio.text;
                        cuiAspectRatio.ratio = classicRatioToCUIRatio(aspectRatio.value);
                        cropConf.aspectRatios.push(cuiAspectRatio)
                    }
            return cropConf
        },
        formatIpeConfig: function(editor, config) {
            if (config.aspectRatios)
                config.aspectRatios = editor.ipeArrayToJsArray(config.aspectRatios);
            return config
        }
    });
    CUI.imageeditor.plugins.PluginRegistry.register("crop", ns.editor.ImageEditor.PluginMixins.Crop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns) {
    ns.editor.ImageEditor.PluginMixins.Map = new Class({
        toString: "Map",
        extend: CUI.imageeditor.plugins.Map,
        fromWCMtoCUI: function(editor, editable, sizeOptions, properties, result) {
            var tmp, sizeHelper = null, coords = null;
            if (properties.hasOwnProperty("imageMap")) {
                sizeHelper = new CUI.imageeditor.TranslationUtil(sizeOptions);
                tmp = {
                    regexp: /\[(\w+)\(([0-9,]+)\)("([^"]*)")?\|("([^"]*)")?\|("([^"]*)")?(\|)?(\(([0-9,\.]+)\))?\]/g
                };
                tmp.transformation = {
                    transformation: "map",
                    areas: []
                };
                while ((tmp.match = tmp.regexp.exec(properties.imageMap)) !== null) {
                    var hrefNumb = 4
                      , targetNumber = 6
                      , altNumber = 8;
                    tmp.area = {
                        href: "",
                        target: "",
                        alt: ""
                    };
                    tmp.area.shape = tmp.match[1];
                    coords = tmp.match[2];
                    if (tmp.match[hrefNumb])
                        tmp.area.href = tmp.match[hrefNumb];
                    if (tmp.match[targetNumber])
                        tmp.area.target = tmp.match[targetNumber];
                    if (tmp.match[altNumber])
                        tmp.area.alt = tmp.match[altNumber];
                    tmp.coords = $.map(coords.split(","), function(e) {
                        return parseInt(e, 10)
                    });
                    switch (tmp.area.shape) {
                    case "rect":
                        tmp.area.selection = {
                            left: sizeHelper.translateWidthToNatural(tmp.coords[0]),
                            top: sizeHelper.translateHeightToNatural(tmp.coords[1]),
                            width: sizeHelper.translateWidthToNatural(tmp.coords[2] - tmp.coords[0]),
                            height: sizeHelper.translateHeightToNatural(tmp.coords[3] - tmp.coords[1])
                        };
                        break;
                    case "circle":
                        tmp.area.selection = {
                            left: sizeHelper.translateWidthToNatural(tmp.coords[0] - tmp.coords[2]),
                            top: sizeHelper.translateHeightToNatural(tmp.coords[1] - tmp.coords[2]),
                            width: sizeHelper.translateWidthToNatural(2 * tmp.coords[2]),
                            height: sizeHelper.translateHeightToNatural(2 * tmp.coords[2])
                        };
                        break;
                    case "poly":
                        tmp.area.points = this.createPointsFromCoords(tmp.coords, sizeHelper);
                        tmp.area.shape = "polygon";
                        break;
                    default:
                        continue
                    }
                    tmp.transformation.areas.push(tmp.area)
                }
                result.push(tmp.transformation)
            }
        },
        fromCUItoWCM: function(editor, editable, sizeOptions, properties, result) {
            var mappings = null, mapping = null, tmp = null, sizeHelper = null, i;
            result.imageMap = null;
            mappings = editor.extractTransformations(properties.result, "map");
            if (mappings && mappings.length > 0)
                mapping = mappings[0];
            if (mapping) {
                sizeHelper = new CUI.imageeditor.TranslationUtil(sizeOptions);
                tmp = {
                    count: 0,
                    area: null,
                    areaStrings: []
                };
                for (tmp.count = 0; tmp.count < mapping.areas.length; tmp.count++) {
                    tmp.area = $.extend({}, mapping.areas[tmp.count]);
                    switch (tmp.area.shape) {
                    case "circle":
                        tmp.radius = Math.round(tmp.area.selection.width / 2);
                        tmp.coords = [sizeHelper.translateWidthToDisplay(tmp.area.selection.left + tmp.radius), sizeHelper.translateHeightToDisplay(tmp.area.selection.top + tmp.radius), sizeHelper.translateWidthToDisplay(tmp.radius, true)];
                        break;
                    case "rect":
                        tmp.coords = [sizeHelper.translateWidthToDisplay(tmp.area.selection.left), sizeHelper.translateHeightToDisplay(tmp.area.selection.top), sizeHelper.translateWidthToDisplay(tmp.area.selection.left + tmp.area.selection.width), sizeHelper.translateHeightToDisplay(tmp.area.selection.top + tmp.area.selection.height)];
                        break;
                    case "polygon":
                        tmp.coords = [];
                        tmp.area.shape = "poly";
                        for (i = 0; i < tmp.area.points.length; i++) {
                            tmp.coords.push(sizeHelper.translateWidthToDisplay(tmp.area.points[i].w));
                            tmp.coords.push(sizeHelper.translateHeightToDisplay(tmp.area.points[i].h))
                        }
                        break;
                    default:
                        continue
                    }
                    tmp.relativeCoords = this.calculateRelativeCoordinates(tmp.coords, sizeHelper);
                    tmp.areaStrings.push("[" + tmp.area.shape + "(" + tmp.coords.join(",") + ')"' + tmp.area.href + '"|"' + tmp.area.target + '"|"' + tmp.area.alt + '"|(' + tmp.relativeCoords.join(",") + ")]")
                }
                result.imageMap = tmp.areaStrings.join("")
            }
        },
        calculateRelativeCoordinates: function(coords, sizeHelper) {
            var croppedRotatedDimensions = sizeHelper.croppedRotatedDim;
            var relativeCoordinates = [];
            var roundNumber = 1E4;
            for (var i = 0; i < coords.length; i++)
                if (i % 2 === 0)
                    relativeCoordinates[i] = Math.round(coords[i] / croppedRotatedDimensions.width * roundNumber) / roundNumber;
                else
                    relativeCoordinates[i] = Math.round(coords[i] / croppedRotatedDimensions.height * roundNumber) / roundNumber;
            return relativeCoordinates
        },
        createPointsFromCoords: function(coords, sizeHelper) {
            var i, point, result = [], iterrator = 2;
            for (i = 1; i < coords.length; i += iterrator) {
                point = {
                    w: sizeHelper.translateWidthToNatural(coords[i - 1]),
                    h: sizeHelper.translateHeightToNatural(coords[i])
                };
                result.push(point)
            }
            return result
        },
        classicConfigToCoralConfig: function(editor, config) {
            return {
                features: config.mapParameter && $.trim(config.mapParameter).length ? "*" : "-"
            }
        }
    });
    CUI.imageeditor.plugins.PluginRegistry.register("map", ns.editor.ImageEditor.PluginMixins.Map)
}
)(jQuery, Granite.author);
(function($, ns, channel, window, undefined) {
    ns.editor.ImageEditor.PluginMixins.Flip = new Class({
        toString: "Flip",
        extend: CUI.imageeditor.plugins.Flip,
        fromWCMtoCUI: function(editor, editable, sizeOptions, properties, result) {
            var obj = {
                transformation: "flip"
            };
            if (properties.hasOwnProperty("imageFlipHorizontal") && properties.imageFlipHorizontal)
                obj.horizontal = properties.imageFlipHorizontal;
            if (properties.hasOwnProperty("imageFlipVertical") && properties.imageFlipVertical)
                obj.vertical = properties.imageFlipVertical;
            if (obj.horizontal || obj.vertical)
                result.push(obj)
        },
        fromCUItoWCM: function(editor, editable, sizeOptions, properties, result) {
            result.imageFlipHorizontal = null;
            result.imageFlipVertical = null;
            var flip = this.extractFlip(editor, properties.result);
            if (flip) {
                if (flip.horizontal)
                    result.imageFlipHorizontal = "" + flip.horizontal;
                if (flip.vertical)
                    result.imageFlipVertical = "" + flip.vertical
            }
        },
        extractFlip: function(editor, transformationResults) {
            var flip = {};
            var matches = editor.extractTransformations(transformationResults, "flip");
            if (matches.length) {
                var match = matches[0];
                if (match.horizontal)
                    flip.horizontal = match.horizontal;
                if (match.vertical)
                    flip.vertical = match.vertical
            }
            return flip
        }
    });
    CUI.imageeditor.plugins.PluginRegistry.register("flip", ns.editor.ImageEditor.PluginMixins.Flip)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var isFullScreen = false;
    var CONTENT_ID = "Content";
    var FULLSCREEN_ID = "FullScreenWrapper";
    var $fullScreenDialog = undefined;
    var isEditorPanelActive = false;
    var $externalStyleSheetLinks = [];
    function getFullScreenDialog(options) {
        var $fsDialog = $("#" + FULLSCREEN_ID);
        if ($fsDialog.length === 0) {
            var $content = $("#" + CONTENT_ID);
            if (options && options.fullscreenDialog) {
                $fsDialog = $(options.fullscreenDialog);
                $fsDialog.attr("id", FULLSCREEN_ID)
            } else {
                $fsDialog = $("\x3cdiv/\x3e").attr("id", FULLSCREEN_ID);
                $fsDialog.addClass("editor-fullscreen-wrapper")
            }
            $content.after($fsDialog)
        }
        return $fsDialog
    }
    function removeFullScreenDialog() {
        var $toRemove = $fullScreenDialog || $("#" + FULLSCREEN_ID);
        if ($toRemove.length > 0)
            $toRemove.remove();
        $fullScreenDialog = undefined
    }
    ns.editor.fullscreenController = function() {
        return {
            start: function($fsContent, options) {
                if (!isFullScreen) {
                    $fullScreenDialog = getFullScreenDialog(options);
                    if (options) {
                        if (options.hasOwnProperty("css"))
                            $fullScreenDialog.addClass(options["css"]);
                        if (options.hasOwnProperty("externalStyleSheets"))
                            if (CUI.rte.Utils.isArray(options["externalStyleSheets"]))
                                for (var index = 0; index < options["externalStyleSheets"].length; index++) {
                                    var externalizedPath = Granite.HTTP.externalize(options["externalStyleSheets"][index]);
                                    var $link = $('\x3clink rel\x3d"stylesheet" href\x3d"' + externalizedPath + '" type\x3d"text/css"\x3e');
                                    $externalStyleSheetLinks.push($link);
                                    $(document.head).append($link)
                                }
                            else {
                                var externalizedPath = Granite.HTTP.externalize(options["externalStyleSheets"]);
                                var $link = $('\x3clink rel\x3d"stylesheet" href\x3d"' + externalizedPath + '" type\x3d"text/css"\x3e');
                                $externalStyleSheetLinks.push($link);
                                $(document.head).append($link)
                            }
                    }
                    if ($fsContent)
                        $fullScreenDialog.append($fsContent);
                    var $content = $("#" + CONTENT_ID);
                    isEditorPanelActive = $content.hasClass("editor-panel-active");
                    if (isEditorPanelActive)
                        $content.removeClass("editor-panel-active");
                    isFullScreen = true
                }
                return $fullScreenDialog
            },
            finish: function() {
                if (isFullScreen) {
                    removeFullScreenDialog();
                    while ($externalStyleSheetLinks.length > 0)
                        $externalStyleSheetLinks.pop().remove();
                    if (isEditorPanelActive)
                        $("#" + CONTENT_ID).addClass("editor-panel-active");
                    isFullScreen = false
                }
            },
            isActive: function() {
                return isFullScreen
            },
            getContainer: function() {
                return $fullScreenDialog
            }
        }
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var ui = {};
    function capitalizeFirstLetter(text) {
        return text.charAt(0).toUpperCase() + text.slice(1)
    }
    function createEditorSelector(editors, editable) {
        var editorSelectorList, editorSelector;
        editorSelectorList = $('\x3ccoral-buttonlist class\x3d"inlineeditor-selector-list"\x3e\x3c/coral-buttonlist\x3e');
        editors.forEach(function(editor) {
            editorSelectorList.append("\x3cbutton is\x3d'coral-buttonlist-item' class\x3d'inlineeditor-selector-list-item' data-editor\x3d'" + editor.type + "' data-targetid\x3d'" + editor.id + "'\x3e" + Granite.I18n.get(capitalizeFirstLetter(editor.title)) + "\x3c/button\x3e")
        });
        return editorSelectorList
    }
    function setUpUI(editors, editable) {
        ui = createEditorSelector(editors, editable);
        var popover = (new Coral.Popover).set({
            alignAt: Coral.Overlay.align.LEFT_BOTTOM,
            alignMy: Coral.Overlay.align.LEFT_TOP,
            content: {
                innerHTML: ""
            },
            target: $(".cq-editable-action")[0],
            open: true
        });
        ui.appendTo(popover.content);
        $(popover).appendTo(document.body)
    }
    function tearDownUI(editable) {
        $("#EditableToolbar").css("opacity", "");
        editable.overlay.dom.find(".inlineeditor-is-hover-subtarget").removeClass("inlineeditor-is-hover-subtarget");
        ui.closest("coral-popover").remove()
    }
    function bindEventsListener(editable) {
        $(".inlineeditor-selector-list-item").on("tap.editorselector click.editorselector", function(event) {
            var expectedTarget = $(event.target).closest("button[data-editor]")
              , editorType = expectedTarget.data("editor")
              , targetId = expectedTarget.data("targetid");
            if (editorType && targetId) {
                $("#EditableToolbar").css("opacity", "0");
                ns.editor.registry[editorType].setUp(editable, targetId)
            }
            tearDownUI(editable)
        });
        channel.on("keyup.editorselector", function(event) {
            if (event.keyCode === 13) {
                var targetId = editable.overlay.dom.find(".inlineeditor-is-hover-subtarget").data("asset-id")
                  , editorType = $(".inlineeditor-selector-list-item[data-targetid\x3d'" + targetId + "']").data("editor");
                if (editorType && targetId) {
                    $("#EditableToolbar").css("opacity", "0");
                    ns.editor.registry[editorType].setUp(editable, targetId)
                }
                tearDownUI(editable)
            }
        });
        channel.on("cq-interaction-focus.toolbar", function(event) {
            tearDownUI(editable)
        });
        $(".inlineeditor-selector-list-item").on("taphold.editorselector mouseenter.editorselector mouseleave.editorselector", function(event) {
            var expectedTarget = $(event.target).closest("button[data-editor]")
              , editorType = expectedTarget.data("editor")
              , targetId = expectedTarget.data("targetid");
            if (event.type === "taphold")
                editable.overlay.dom.find(".inlineeditor-is-hover-subtarget").removeClass("inlineeditor-is-hover-subtarget");
            if (editorType && targetId) {
                var dropTarget = editable.getDropTarget(targetId);
                if (dropTarget)
                    dropTarget.overlay.toggleClass("inlineeditor-is-hover-subtarget");
                else
                    editable.overlay.dom.find("[data-asset-id\x3d'" + targetId + "']").toggleClass("inlineeditor-is-hover-subtarget")
            }
        })
    }
    function unbindEventsListener() {
        $(".inlineeditor-selector-list-item").off("tap.editorselector click.editorselector");
        channel.off("keyup.editorselector");
        $(".inlineeditor-selector-list-item").off("taphold.editorselector mouseenter.editorselector mouseleave.editorselector")
    }
    ns.editor.HybridEditor = function(editors) {
        var self = this;
        if (editors !== null)
            self.editors = editors;
        channel.on("inline-edit-start", function(e) {
            var editable = e.editable;
            self.startHybridEditor(editable)
        })
    }
    ;
    ns.editor.HybridEditor.prototype.setUp = function(editable) {
        var editors = editable.config.editConfig.inplaceEditingConfig.childEditors;
        if (editors == null)
            editors = [];
        $.each(editors, function(index) {
            try {
                editors[index] = JSON.parse(this.toString())
            } catch (error) {}
        });
        this.editors = editors || this.editors;
        this.editors = $.grep(this.editors, function(editor) {
            return editor.type !== "image" || editable.dom.has(".cq-placeholder[class$\x3d" + editor.id + "]").length === 0
        });
        this.startHybridEditor(editable)
    }
    ;
    ns.editor.HybridEditor.prototype.tearDown = function(editable) {
        this.endHybridEditor(editable)
    }
    ;
    ns.editor.HybridEditor.prototype.startHybridEditor = function(editable) {
        if (this.editors.length > 1)
            setUpUI(this.editors, editable);
        else if (this.editors.length === 1)
            ns.editor.registry[this.editors[0].type].setUp(editable, this.editors[0].id);
        bindEventsListener(editable)
    }
    ;
    ns.editor.HybridEditor.prototype.endHybridEditor = function(editable) {
        tearDownUI(editable);
        unbindEventsListener()
    }
    ;
    ns.editor.register("hybrid", new ns.editor.HybridEditor)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var textImageEditorConfig = {
        editors: [{
            type: Granite.I18n.get("text"),
            title: Granite.I18n.get("Text")
        }, {
            type: Granite.I18n.get("image"),
            title: Granite.I18n.get("Image")
        }]
    };
    ns.editor.TextImageEditor = function() {}
    ;
    ns.editor.TextImageEditor.prototype = new ns.editor.HybridEditor(textImageEditorConfig.editors);
    ns.editor.register("textimage", new ns.editor.TextImageEditor)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.editor.TitleEditor = function() {}
    ;
    ns.editor.TitleEditor.prototype.setUp = function(editable) {
        var self = this;
        if (!editable.config.ipeConfig.titleTag)
            editable.config.ipeConfig.titleTag = ["h1"];
        this._currentElem = editable.dom.find(editable.config.ipeConfig.titleTag.join(", "));
        if (this._currentElem.length === 0)
            this._currentElem = $(document.createElement(editable.config.ipeConfig.titleTag[0])).appendTo(editable.dom);
        this._currentElem.prop("contenteditable", true).trigger("focus");
        channel.trigger("cq-hide-overlays");
        this._currentElem.on("blur.title-editor", function(ev) {
            self.save(editable).then(function() {
                ns.selection.select(editable)
            });
            self.tearDown(editable)
        }).on("keydown.title-editor", function(ev) {
            var ESCAPE = 27;
            var ENTER = 13;
            if (ev.which === ENTER || ev.which === ESCAPE) {
                self.tearDown(editable);
                self[ev.which === ENTER ? "save" : "abort"](editable).then(function() {
                    self._currentElem.trigger("blur");
                    ns.selection.select(editable)
                });
                ev.preventDefault()
            }
        });
        ns.history.Manager.setBlocked(true);
        ns.persistence.readParagraphContent(editable).then(function(data) {
            var content = $.parseJSON(data);
            self.notifyInitialHistoryContent(editable.path, content["jcr:title"])
        }).fail(function(data) {
            ns.persistence.updateParagraph(editable, {
                "./sling:resourceType": editable.type
            }).then(function() {
                ns.persistence.readParagraphContent(editable).then(function(data) {
                    var content = $.parseJSON(data);
                    self.notifyInitialHistoryContent(editable.path, content["jcr:title"])
                })
            })
        })
    }
    ;
    ns.editor.TitleEditor.prototype.save = function(editable) {
        var self = this;
        var newTitle = this._currentElem.text();
        return ns.edit.EditableActions.UPDATE.execute(editable, {
            "./jcr:title": newTitle,
            "./sling:resourceType": editable.type
        }).always(function() {
            self.addHistoryStep(editable, newTitle)
        })
    }
    ;
    ns.editor.TitleEditor.prototype.notifyInitialHistoryContent = function(path, initialContent) {
        var historyEnabled = ns.history.Manager.isEnabled()
          , self = this;
        if (historyEnabled) {
            self.historyPath = path;
            self.historyInitialContent = initialContent
        }
    }
    ;
    ns.editor.TitleEditor.prototype.addHistoryStep = function(editable, persistedContent) {
        var self = this
          , updateProperty = "./jcr:title"
          , originalData = {}
          , changedData = {};
        if (editable) {
            originalData[updateProperty] = self.historyInitialContent;
            changedData[updateProperty] = persistedContent;
            if (originalData[updateProperty] !== changedData[updateProperty])
                ns.history.util.Utils.addUpdateParagraphStep(self.historyPath, editable.type, originalData, changedData)
        }
    }
    ;
    ns.editor.TitleEditor.prototype.abort = function(editable) {
        return ns.edit.EditableActions.REFRESH.execute(editable)
    }
    ;
    ns.editor.TitleEditor.prototype.tearDown = function(editable) {
        this._currentElem.off("blur.title-editor keydown.title-editor").prop("contenteditable", false);
        ns.history.Manager.setBlocked(false);
        channel.trigger("cq-show-overlays")
    }
    ;
    ns.editor.register("title", new ns.editor.TitleEditor)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.editor.PlainTextEditor = function() {}
    ;
    ns.editor.PlainTextEditor.prototype.setUp = function(editable, targetId) {
        var self = this;
        var editableDom = editable.dom;
        var ipeConfig = $.extend(true, {}, editable.config.ipeConfig);
        ipeConfig = targetId ? ipeConfig[targetId] || {} : ipeConfig;
        var subElementQuery = ipeConfig["editElementQuery"] || (targetId ? "div." + targetId : ".");
        if (subElementQuery != ".") {
            var $subEditable = editableDom.find(subElementQuery);
            if ($subEditable.length)
                editableDom = $subEditable
        }
        this._currentElem = editableDom.prop("contenteditable", true).trigger("focus");
        channel.trigger("cq-hide-overlays");
        this._currentElem.on("blur.plaintext-editor", function(ev) {
            self.save(editable, targetId).then(function() {
                ns.selection.select(editable)
            });
            self.tearDown(editable)
        }).on("keydown.plaintext-editor", function(ev) {
            var ESCAPE = 27;
            var ENTER = 13;
            if (ev.which === ENTER) {
                self.tearDown(editable);
                self.abort(editable).then(function() {
                    self._currentElem.trigger("blur");
                    ns.selection.select(editable)
                });
                ev.preventDefault()
            } else if (ev.which === ESCAPE)
                ev.preventDefault()
        })
    }
    ;
    ns.editor.PlainTextEditor.prototype.save = function(editable, targetId) {
        var ipeConfig = $.extend(true, {}, editable.config.ipeConfig);
        ipeConfig = targetId ? ipeConfig[targetId] || {} : ipeConfig;
        var targetFieldName = ipeConfig.textPropertyName ? ipeConfig.textPropertyName : "./text";
        var data = {};
        data[targetFieldName] = this._currentElem[0].innerText;
        return ns.edit.EditableActions.UPDATE.execute(editable, data)
    }
    ;
    ns.editor.PlainTextEditor.prototype.abort = function(editable) {
        return ns.edit.EditableActions.REFRESH.execute(editable)
    }
    ;
    ns.editor.PlainTextEditor.prototype.tearDown = function(editable) {
        this._currentElem.off("blur.plaintext-editor keydown.plaintext-editor").prop("contenteditable", false);
        channel.trigger("cq-show-overlays")
    }
    ;
    ns.editor.register("plaintext", new ns.editor.PlainTextEditor)
}
)(jQuery, Granite.author, jQuery(document), this);
CUI.rte.GraniteI18nProvider = new Class({
    extend: CUI.rte.I18nProvider,
    _map: {
        "dialog.apply": Granite.I18n.get("Apply"),
        "dialog.cancel": Granite.I18n.get("Cancel"),
        "dialogs.find.matchCase": Granite.I18n.get("Match Case"),
        "dialog.fullscreen.minimize": Granite.I18n.get("Minimize"),
        "dialog.fullscreen.text": Granite.I18n.get("Text"),
        "dialog.anchor.remove": Granite.I18n.get("Remove"),
        "dialog.find.find": Granite.I18n.get("Find"),
        "dialog.link.path": Granite.I18n.get("Path"),
        "dialog.link.pathLabel": Granite.I18n.get("Path"),
        "dialog.link.pickerTitle": Granite.I18n.get("Choose a target path"),
        "dialog.link.target": Granite.I18n.get("Target"),
        "dialog.link.same_tab": Granite.I18n.get("Same Tab"),
        "dialog.link.new_tab": Granite.I18n.get("New Tab"),
        "dialog.link.parent_frame": Granite.I18n.get("Parent Frame"),
        "dialog.link.top_frame": Granite.I18n.get("Top Frame"),
        "dialog.link.titleLabel": Granite.I18n.get("Alternative text"),
        "dialog.link.titleFieldPlaceHolder": Granite.I18n.get("Alt Text"),
        "dialog.pastePlainText.pasteAreaPlaceHolder": Granite.I18n.get("Please paste your text here...."),
        "dialog.replace.findButton": Granite.I18n.get("Find"),
        "dialog.replace.replaceButton": Granite.I18n.get("Replace"),
        "dialogs.replace.matchcase": Granite.I18n.get("Match Case"),
        "dialog.replace.replaceAllButton": Granite.I18n.get("Replace all"),
        "dialog.tableAndCellProps.cellProps": Granite.I18n.get("CELL PROPERTIES"),
        "dialog.tableAndCellProps.tableProps": Granite.I18n.get("TABLE PROPERTIES"),
        "dialog.tableAndCellProps.width": Granite.I18n.get("Width"),
        "dialog.tableAndCellProps.widthToolTip": Granite.I18n.get('Width in pixels. For relative values add "%" e.g. "40%".'),
        "dialog.tableAndCellProps.noneAlignHor": Granite.I18n.get("None"),
        "dialog.tableAndCellProps.leftAlign": Granite.I18n.get("Left"),
        "dialog.tableAndCellProps.centerAlign": Granite.I18n.get("Center"),
        "dialog.tableAndCellProps.rightAlign": Granite.I18n.get("Right"),
        "dialog.tableAndCellProps.dataCell": Granite.I18n.get("Data"),
        "dialog.tableAndCellProps.headerCell": Granite.I18n.get("Header"),
        "dialog.tableAndCellProps.height": Granite.I18n.get("Height"),
        "dialog.tableAndCellProps.heightToolTip": Granite.I18n.get('Height in pixels. For relative values add "%" e.g. "40%".'),
        "dialog.tableAndCellProps.noneAlignVer": Granite.I18n.get("None"),
        "dialog.tableAndCellProps.topAlign": Granite.I18n.get("Top"),
        "dialog.tableAndCellProps.middleAlign": Granite.I18n.get("Middle"),
        "dialog.tableAndCellProps.bottomAlign": Granite.I18n.get("Bottom"),
        "dialog.tableAndCellProps.baselineAlign": Granite.I18n.get("Baseline"),
        "dialog.tableAndCellProps.cellType": Granite.I18n.get("Cell Type"),
        "dialog.tableAndCellProps.hiddenHeader": Granite.I18n.get("Hidden Header"),
        "dialog.tableAndCellProps.headerAttrib": Granite.I18n.get("Header"),
        "dialog.tableAndCellProps.idAttrib": Granite.I18n.get("Id"),
        "dialog.tableAndCellProps.scopeAttrib": Granite.I18n.get("Scope"),
        "dialog.tableAndCellProps.noneScopeAttrib": Granite.I18n.get("Scope"),
        "dialog.tableAndCellProps.rowScope": Granite.I18n.get("Row"),
        "dialog.tableAndCellProps.columnScope": Granite.I18n.get("Column"),
        "dialog.tableAndCellProps.cellPadding": Granite.I18n.get("Cell padding"),
        "dialog.tableAndCellProps.cellSpacing": Granite.I18n.get("Cell spacing"),
        "dialog.tableAndCellProps.border": Granite.I18n.get("Border"),
        "dialog.tableAndCellProps.caption": Granite.I18n.get("Caption"),
        "dialog.tableProps.columns": Granite.I18n.get("Columns*"),
        "dialog.tableProps.width": Granite.I18n.get("Width"),
        "dialog.tableProps.cellPadding": Granite.I18n.get("Cell padding"),
        "dialog.tableProps.rows": Granite.I18n.get("Rows*"),
        "dialog.tableProps.height": Granite.I18n.get("Height"),
        "dialog.tableProps.cellSpacing": Granite.I18n.get("Cell spacing"),
        "dialog.tableProps.border": Granite.I18n.get("Border"),
        "dialog.tableProps.noHeader": Granite.I18n.get("No Header"),
        "dialog.tableProps.rowHeader": Granite.I18n.get("First row"),
        "dialog.tableProps.colHeader": Granite.I18n.get("First column"),
        "dialog.tableProps.rowAndColHeader": Granite.I18n.get("First row and column"),
        "dialog.tableProps.caption": Granite.I18n.get("Caption"),
        "dialog.tracklink.enabledLabel": Granite.I18n.get("Enable link tracking"),
        "dialog.tracklink.eventsPlaceHolder": Granite.I18n.get("event1, event2, ..."),
        "dialog.tracklink.evarsPlaceHolder": Granite.I18n.get("eVar1:pagedata.url, prop1:'const', ..."),
        "kernel.alertTitlePaste": Granite.I18n.get("Paste"),
        "kernel.alertSecurityPaste": Granite.I18n.get("Your browser's security settings don't permit the editor to execute paste operations.\x3cbr\x3ePlease use the keyboard shortcut (Ctrl/Cmd+V)."),
        "kernel.alertTitleCopy": Granite.I18n.get("Copy"),
        "kernel.alertSecurityCopy": Granite.I18n.get("Your browser's security settings don't permit the editor to execute copy operations.\x3cbr\x3ePlease use the keyboard shortcut (Ctrl/Cmd+C)."),
        "kernel.alertTitleCut": Granite.I18n.get("Cut"),
        "kernel.alertSecurityCut": Granite.I18n.get("Your browser's security settings don't permit the editor to execute cut operations.\x3cbr\x3ePlease use the keyboard shortcut (Ctrl/Cmd+X)."),
        "kernel.alertTitleError": Granite.I18n.get("Error"),
        "kernel.alertIELimitation": Granite.I18n.get("Could not insert text due to internal Internet Explorer limitations. Please try to select a smaller text fragment and try again."),
        "commands.paste.alertTitle": Granite.I18n.get("Paste"),
        "commands.paste.alertTableError": Granite.I18n.get("You are trying to paste table data into an existing table.\x3cbr\x3eAs this operation would result in invalid HTML, it has been cancelled.\x3cbr\x3ePlease try to simplify the table's structure and try again."),
        "commands.paste.alertCellSelectionError": Granite.I18n.get("You are trying to paste table data into an non-rectangular cell selection.\x3cbr\x3ePlease choose a rectangular cell selection and try again."),
        "popover.trigger.plugins.Format": Granite.I18n.get("Format"),
        "popover.trigger.plugins.Paraformat": Granite.I18n.get("Paragraph formats"),
        "popover.trigger.plugins.Justify": Granite.I18n.get("Justify"),
        "popover.trigger.plugins.Lists": Granite.I18n.get("Lists"),
        "popover.trigger.plugins.Styles": Granite.I18n.get("Styles"),
        "plugins.editTools.cutTitle": Granite.I18n.get("Cut (Ctrl+X)"),
        "plugins.editTools.cutText": Granite.I18n.get("Cuts the currently selected text and puts it in to the clipboard."),
        "plugins.editTools.copyTitle": Granite.I18n.get("Copy (Ctrl+C)"),
        "plugins.editTools.copyText": Granite.I18n.get("Copies the currently selected text to the clipboard."),
        "plugins.editTools.pasteDefaultTitle": Granite.I18n.get("Paste (Ctrl+V)"),
        "plugins.editTools.pasteDefaultText": Granite.I18n.get("Pastes the clipboard content with the default paste method."),
        "plugins.editTools.pastePlainTextTitle": Granite.I18n.get("Paste as text"),
        "plugins.editTools.pastePlainTextText": Granite.I18n.get("Pastes the clipboard content as plain text."),
        "plugins.editTools.pasteWordHtmlTitle": Granite.I18n.get("Paste from Word"),
        "plugins.editTools.pasteWordHtmlText": Granite.I18n.get("Pastes the clipboard content from Word, applying some cleanup."),
        "plugins.findReplace.findTitle": Granite.I18n.get("Find"),
        "plugins.findReplace.replaceTitle": Granite.I18n.get("Replace"),
        "plugins.findReplace.findReplaceTitle": Granite.I18n.get("Find/Replace"),
        "plugins.findReplace.replaceAllTitle": Granite.I18n.get("Replace all"),
        "plugins.findReplace.alertNoMoreResults": Granite.I18n.get("No more occurences of '{0}' found in document.\x3cbr\x3eSearch will be continued from the top."),
        "plugins.findReplace.alertReplaceResults": Granite.I18n.get("Text '{0}' has been replaced {1} time(s)."),
        "plugins.findReplace.alertNotFound": Granite.I18n.get("Text '{0}' not found."),
        "plugins.findReplace.alertIEProblems": Granite.I18n.get("Could not replace due to limited functionality in Internet Explorer."),
        "plugins.findReplace.tooltipFind": Granite.I18n.get("Finds a text fragment in the text being edited."),
        "plugins.findReplace.tooltipReplace": Granite.I18n.get("Replaces a text fragment with another fragment."),
        "plugins.format.boldTitle": Granite.I18n.get("Bold (Ctrl+B)"),
        "plugins.format.boldText": Granite.I18n.get("Make the selected text bold."),
        "plugins.format.italicTitle": Granite.I18n.get("Italic (Ctrl+I)"),
        "plugins.format.italicText": Granite.I18n.get("Make the selected text italic."),
        "plugins.format.underlineTitle": Granite.I18n.get("Underline (Ctrl+U)"),
        "plugins.format.underlineText": Granite.I18n.get("Underline the selected text."),
        "plugins.image.alignMenu": Granite.I18n.get("Image alignment"),
        "plugins.image.alignLeft": Granite.I18n.get("Left"),
        "plugins.image.alignRight": Granite.I18n.get("Right"),
        "plugins.image.alignNone": Granite.I18n.get("None"),
        "plugins.image.alignInherit": Granite.I18n.get("Inherit"),
        "plugins.image.imageTitle": Granite.I18n.get("Image"),
        "plugins.image.noAlign": Granite.I18n.get("No alignment"),
        "plugins.image.properties": Granite.I18n.get("Image Properties"),
        "plugins.justify.leftTitle": Granite.I18n.get("Align Text Left"),
        "plugins.justify.leftText": Granite.I18n.get("Align text to the left."),
        "plugins.justify.centerTitle": Granite.I18n.get("Center Text"),
        "plugins.justify.centerText": Granite.I18n.get("Center text in the editor."),
        "plugins.justify.rightTitle": Granite.I18n.get("Align Text Right"),
        "plugins.justify.rightText": Granite.I18n.get("Align text to the right."),
        "plugins.justify.justifyTitle": Granite.I18n.get("Justify Text"),
        "plugins.justify.justifyText": Granite.I18n.get("Stretch to equal width."),
        "plugins.link.linkTitle": Granite.I18n.get("Hyperlink"),
        "plugins.link.linkText": Granite.I18n.get("Create or modify a hyperlink."),
        "plugins.link.unlinkTitle": Granite.I18n.get("Unlink"),
        "plugins.link.unlinkText": Granite.I18n.get("Remove an existing hyperlink from the selected text."),
        "plugins.link.anchorTitle": Granite.I18n.get("Anchor"),
        "plugins.link.anchorText": Granite.I18n.get("Add or edit an anchor."),
        "plugins.list.ulTitle": Granite.I18n.get("Bullet List"),
        "plugins.list.ulText": Granite.I18n.get("Start a bulleted list."),
        "plugins.list.olTitle": Granite.I18n.get("Numbered List"),
        "plugins.list.olText": Granite.I18n.get("Start a numbered list."),
        "plugins.list.indentTitle": Granite.I18n.get("Indent"),
        "plugins.list.indentText": Granite.I18n.get("Indents the selected paragraph(s) or list item(s)."),
        "plugins.list.outdentTitle": Granite.I18n.get("Outdent"),
        "plugins.list.outdentText": Granite.I18n.get("Outdents the current paragraph(s) or list item(s)."),
        "plugins.miscTools.sourceEditTitle": Granite.I18n.get("Source Edit"),
        "plugins.miscTools.sourceEditText": Granite.I18n.get("Switch to source editing mode."),
        "plugins.miscTools.specialCharsTitle": Granite.I18n.get("Special Characters"),
        "plugins.miscTools.specialCharsText": Granite.I18n.get("Insert a special character."),
        "plugins.paraFormat.defaultP": Granite.I18n.get("Paragraph"),
        "plugins.paraFormat.defaultH1": Granite.I18n.get("Heading 1"),
        "plugins.paraFormat.defaultH2": Granite.I18n.get("Heading 2"),
        "plugins.paraFormat.defaultH3": Granite.I18n.get("Heading 3"),
        "plugins.spellCheck.checkSpellTitle": Granite.I18n.get("Check spelling"),
        "plugins.spellCheck.checkSpellText": Granite.I18n.get("Checks the spelling of the entire text."),
        "plugins.spellCheck.spellChecking": Granite.I18n.get("Spell Checking"),
        "plugins.spellCheck.noMistakeAlert": Granite.I18n.get("No spelling mistakes found."),
        "plugins.spellCheck.failAlert": Granite.I18n.get("Spell checking failed."),
        "plugins.spellCheck.noSuggestions": Granite.I18n.get("No suggestions available"),
        "plugins.subSuperScript.subTitle": Granite.I18n.get("Subscript"),
        "plugins.subSuperScript.subText": Granite.I18n.get("Formats the selected text as subscript."),
        "plugins.subSuperScript.superTitle": Granite.I18n.get("Superscript"),
        "plugins.subSuperScript.superText": Granite.I18n.get("Formats the selected text as superscript."),
        "plugins.table.tableTitle": Granite.I18n.get("Table"),
        "plugins.table.tableText": Granite.I18n.get("Creates a new table or edits the properties of an existing table."),
        "plugins.table.cellTitle": Granite.I18n.get("Cell"),
        "plugins.table.cellText": Granite.I18n.get("Edit the properties of a selected cell."),
        "plugins.table.insertAboveTitle": Granite.I18n.get("Insert Above"),
        "plugins.table.insertAboveText": Granite.I18n.get("Insert a new row above the current row."),
        "plugins.table.insertBelowTitle": Granite.I18n.get("Insert Below"),
        "plugins.table.insertBelowText": Granite.I18n.get("Insert a new row below the current row."),
        "plugins.table.deleteRowTitle": Granite.I18n.get("Delete Row"),
        "plugins.table.deleteRowText": Granite.I18n.get("Delete the current row."),
        "plugins.table.insertLeftTitle": Granite.I18n.get("Insert Left"),
        "plugins.table.insertLeftText": Granite.I18n.get("Insert a new column to the left of the current column."),
        "plugins.table.insertRightTitle": Granite.I18n.get("Insert Right"),
        "plugins.table.insertRightText": Granite.I18n.get("Insert a new column to the right of the current column."),
        "plugins.table.deleteColumnTitle": Granite.I18n.get("Delete Column"),
        "plugins.table.deleteColumnText": Granite.I18n.get("Delete the current column."),
        "plugins.table.cellProps": Granite.I18n.get("Cell properties"),
        "plugins.table.mergeCells": Granite.I18n.get("Merge cells"),
        "plugins.table.mergeRight": Granite.I18n.get("Merge right"),
        "plugins.table.mergeDown": Granite.I18n.get("Merge down"),
        "plugins.table.splitHor": Granite.I18n.get("Split cell horizontally"),
        "plugins.table.splitVert": Granite.I18n.get("Split cell vertically"),
        "plugins.table.cell": Granite.I18n.get("Cell"),
        "plugins.table.column": Granite.I18n.get("Column"),
        "plugins.table.row": Granite.I18n.get("Row"),
        "plugins.table.insertBefore": Granite.I18n.get("Insert before"),
        "plugins.table.insertAfter": Granite.I18n.get("Insert after"),
        "plugins.table.remove": Granite.I18n.get("Remove"),
        "plugins.table.tableProps": Granite.I18n.get("Table properties"),
        "plugins.table.removeTable": Granite.I18n.get("Remove table"),
        "plugins.table.nestedTable": Granite.I18n.get("Create nested table"),
        "plugins.table.selectRow": Granite.I18n.get("Select entire row"),
        "plugins.table.selectColumn": Granite.I18n.get("Select entire column"),
        "plugins.table.insertParaBefore": Granite.I18n.get("Insert paragraph before table"),
        "plugins.table.insertParaAfter": Granite.I18n.get("Insert paragraph after table"),
        "plugins.table.createTable": Granite.I18n.get("Create table"),
        "plugins.table.ensureparagraph": Granite.I18n.get("Ensure Paragraph"),
        "plugins.table.modifytableandcell": Granite.I18n.get("Edit Table and Cell Properties"),
        "plugins.table.exitTableEditing": Granite.I18n.get("Exit Table Editing"),
        "plugins.undoRedo.undoTitle": Granite.I18n.get("Undo"),
        "plugins.undoRedo.undoText": Granite.I18n.get("Undo the last change."),
        "plugins.undoRedo.redoTitle": Granite.I18n.get("Redo"),
        "plugins.undoRedo.redoText": Granite.I18n.get("Redo previously undone changes."),
        "plugins.fullscreen.toggleTitle": Granite.I18n.get("Fullscreen"),
        "plugins.fullscreen.toggleText": Granite.I18n.get("Toggle fullscreen mode."),
        "plugins.fullscreen.startTitle": Granite.I18n.get("Fullscreen"),
        "plugins.fullscreen.startText": Granite.I18n.get("Start fullscreen mode."),
        "plugins.fullscreen.finishTitle": Granite.I18n.get("Fullscreen"),
        "plugins.fullscreen.finishText": Granite.I18n.get("Exit fullscreen mode."),
        "plugins.control.closeTitle": Granite.I18n.get("Close"),
        "plugins.control.closeText": Granite.I18n.get("Finish editing the text."),
        "plugins.control.saveTitle": Granite.I18n.get("Save")
    },
    getText: function(id, values) {
        var text = id;
        if (this._map && this._map.hasOwnProperty(id))
            text = this._map[id];
        if (values)
            if (!CUI.rte.Utils.isArray(values))
                text = text.replace("{0}", values);
            else
                for (var s = 0; s < values.length; s++)
                    text = text.replace("{" + s + "}", values[s]);
        return text
    },
    getLocale: function() {
        return Granite.I18n.getLocale()
    }
});
CUI.rte.Utils.setI18nProvider(new CUI.rte.GraniteI18nProvider);
CUI.rte.ui.cui.DEFAULT_UI_SETTINGS = {
    "inline": {
        "toolbar": ["#format", "#justify", "#lists", "links#modifylink", "links#unlink", "tracklinks#modifylinktracking", "fullscreen#start", "control#close", "control#save"],
        "popovers": {
            "format": {
                "ref": "format",
                "items": ["format#bold", "format#italic", "format#underline"]
            },
            "justify": {
                "ref": "justify",
                "items": ["justify#justifyleft", "justify#justifycenter", "justify#justifyright", "justify#justifyjustify"]
            },
            "lists": {
                "ref": "lists",
                "items": ["lists#unordered", "lists#ordered", "lists#outdent", "lists#indent"]
            },
            "styles": {
                "ref": "styles",
                "items": "styles:getStyles:styles-pulldown"
            },
            "paraformat": {
                "ref": "paraformat",
                "items": "paraformat:getFormats:paraformat-pulldown"
            }
        }
    },
    "fullscreen": {
        "toolbar": ["format#bold", "format#italic", "format#underline", "subsuperscript#subscript", "subsuperscript#superscript", "edit#cut", "edit#copy", "edit#paste-default", "edit#paste-plaintext", "edit#paste-wordhtml", "links#modifylink", "links#unlink", "links#anchor", "tracklinks#modifylinktracking", "findreplace#find", "findreplace#replace", "undo#undo", "undo#redo", "justify#justifyleft", "justify#justifycenter", "justify#justifyright", "justify#justifyjustify", "lists#unordered", "lists#ordered", "lists#outdent", "lists#indent", "table#createoredit", "image#imageProps", "spellcheck#checktext", "generichtml#generichtml", "misctools#specialchars", "misctools#sourceedit", "#styles", "#paraformat"],
        "popovers": {
            "styles": {
                "ref": "styles",
                "items": "styles:getStyles:styles-pulldown"
            },
            "paraformat": {
                "ref": "paraformat",
                "items": "paraformat:getFormats:paraformat-pulldown"
            }
        }
    },
    "tableEditOptions": {
        "toolbar": ["table#insertcolumn-before", "table#insertcolumn-after", "table#removecolumn", "table#insertrow-before", "table#insertrow-after", "table#removerow", "table#mergecells-right", "table#mergecells-down", "table#mergecells", "table#splitcell-horizontal", "table#splitcell-vertical", "table#selectrow", "table#selectcolumn", "table#ensureparagraph", "table#modifytableandcell", "table#removetable", "undo#undo", "undo#redo", "table#exitTableEditing"]
    }
};
CUI.rte.ui.cui.DEFAULT_UI_SETTINGS["dialogFullScreen"] = CUI.rte.ui.cui.DEFAULT_UI_SETTINGS["fullscreen"];
CUI.rte.Theme.BLANK_IMAGE = Granite.HTTP.externalize("/libs/clientlibs/granite/richtext/resources/images/blank.png");
CUI.rte.Theme.PLACEHOLDER_STYLE = "background: url(" + Granite.HTTP.externalize("/libs/cq/gui/components/authoring/editors/clientlibs/core/css/resources/genhtml-placeholder.svg") + ") no-repeat bottom center; " + "width: 16px; min-width: 16px; max-width: 16px; " + "height: 16px; min-height: 16px; max-height: 16px; " + "padding-left: 2px; padding-right: 2px;";
(function($) {
    CUI.rte.ui.cui.CQLinkBaseDialog = new Class({
        extend: CUI.rte.ui.cui.LinkBaseDialog,
        toString: "CQLinkBaseDialog",
        hbTemplate: function anonymous(data_0) {
            var frag = document.createDocumentFragment();
            var data = data_0;
            var el0 = document.createElement("div");
            el0.className += " rte-dialog-columnContainer";
            el0.style.cssText += "display:flex; flex-direction:column";
            var labelPath = document.createElement("label");
            labelPath.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.pathLabel");
            labelPath.style.cssText += "padding-left: 10px";
            el0.appendChild(labelPath);
            var el1 = document.createTextNode("\n    ");
            el0.appendChild(el1);
            var el2 = document.createElement("div");
            el2.className += " rte-dialog-column";
            var el3 = document.createTextNode("\n      ");
            el2.appendChild(el3);
            var el4 = document.createElement("foundation-autocomplete");
            el4.setAttribute("pickersrc", data_0["pickerSrc"]);
            el4.setAttribute("placeholder", CUI["rte"]["Utils"]["i18n"]("dialog.link.path"));
            el4.setAttribute("name", "href");
            var el5 = document.createTextNode("\n        ");
            el4.appendChild(el5);
            var el6 = document.createElement("coral-overlay");
            el6.className += " foundation-autocomplete-value foundation-picker-buttonlist";
            el6.setAttribute("data-foundation-picker-buttonlist-src", data_0["suggestionSrc"]);
            el4.appendChild(el6);
            var el7 = document.createTextNode("\n        ");
            el4.appendChild(el7);
            var el8 = document.createElement("coral-taglist");
            el8.setAttribute("foundation-autocomplete-value", "");
            el8.setAttribute("name", "href");
            el4.appendChild(el8);
            var el9 = document.createTextNode("\n      ");
            el4.appendChild(el9);
            el2.appendChild(el4);
            var el10 = document.createTextNode("\n    ");
            el2.appendChild(el10);
            el0.appendChild(el2);
            var el11 = document.createTextNode("\n");
            el0.appendChild(el11);
            frag.appendChild(el0);
            var el12 = document.createTextNode("\n");
            frag.appendChild(el12);
            var el13 = document.createElement("div");
            var labelTag = document.createElement("label");
            labelTag.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.titleLabel");
            labelTag.style.cssText += "padding-left: 10px";
            el13.appendChild(labelTag);
            el13.className += " rte-dialog-columnContainer";
            el13.style.cssText += "display:flex; flex-direction:column";
            var el14 = document.createTextNode("\n    ");
            el13.appendChild(el14);
            var el15 = document.createElement("div");
            el15.className += " rte-dialog-column";
            var el16 = document.createElement("label");
            var el17 = document.createTextNode(" ");
            el16.appendChild(el17);
            var el18 = document.createElement("input", "coral-textfield");
            el18.setAttribute("is", "coral-textfield");
            el18.setAttribute("data-type", "title");
            el18.setAttribute("placeholder", CUI["rte"]["Utils"]["i18n"]("dialog.link.titleFieldPlaceHolder"));
            el16.appendChild(el18);
            var el19 = document.createTextNode(" ");
            el16.appendChild(el19);
            el15.appendChild(el16);
            var el20 = document.createTextNode(" ");
            el15.appendChild(el20);
            el13.appendChild(el15);
            var el21 = document.createTextNode("\n");
            el13.appendChild(el21);
            frag.appendChild(el13);
            var el22 = document.createTextNode("\n");
            frag.appendChild(el22);
            var el23 = document.createElement("div");
            el23.className += " rte-dialog-columnContainer";
            var el24 = document.createTextNode("\n    ");
            el23.appendChild(el24);
            var el25 = document.createElement("div");
            el25.className += " rte-dialog-column";
            var el26 = document.createTextNode("\n        ");
            el25.appendChild(el26);
            var el27 = this["targetSelect"] = document.createElement("coral-select");
            el27.setAttribute("handle", "targetSelect");
            var el28 = document.createTextNode("\n            ");
            el27.appendChild(el28);
            var el29 = document.createElement("coral-select-item");
            el29.setAttribute("value", "");
            el29.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.target");
            el27.appendChild(el29);
            var el30 = document.createTextNode("\n            ");
            el27.appendChild(el30);
            var el31 = document.createElement("coral-select-item");
            el31.setAttribute("value", "_self");
            el31.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.same_tab");
            el27.appendChild(el31);
            var el32 = document.createTextNode("\n            ");
            el27.appendChild(el32);
            var el33 = document.createElement("coral-select-item");
            el33.setAttribute("value", "_blank");
            el33.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.new_tab");
            el27.appendChild(el33);
            var el34 = document.createTextNode("\n            ");
            el27.appendChild(el34);
            var el35 = document.createElement("coral-select-item");
            el35.setAttribute("value", "_parent");
            el35.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.parent_frame");
            el27.appendChild(el35);
            var el36 = document.createTextNode("\n            ");
            el27.appendChild(el36);
            var el37 = document.createElement("coral-select-item");
            el37.setAttribute("value", "_top");
            el37.textContent = CUI["rte"]["Utils"]["i18n"]("dialog.link.top_frame");
            el27.appendChild(el37);
            var el38 = document.createTextNode("\n        ");
            el27.appendChild(el38);
            el25.appendChild(el27);
            var el39 = document.createTextNode("\n    ");
            el25.appendChild(el39);
            el23.appendChild(el25);
            var el40 = document.createTextNode("\n");
            el23.appendChild(el40);
            frag.appendChild(el23);
            var el41 = document.createTextNode("\n");
            frag.appendChild(el41);
            var el42 = document.createElement("div");
            el42.className += " rte-dialog-columnContainer";
            var el43 = document.createTextNode("\n    ");
            el42.appendChild(el43);
            var el44 = document.createElement("div");
            el44.className += " rte-dialog-column rte-dialog-column--rightAligned";
            var el45 = document.createTextNode("\n        ");
            el44.appendChild(el45);
            var el46 = document.createElement("button", "coral-button");
            el46.setAttribute("is", "coral-button");
            el46.setAttribute("icon", "close");
            el46.setAttribute("title", CUI["rte"]["Utils"]["i18n"]("dialog.cancel"));
            el46.setAttribute("aria-label", CUI["rte"]["Utils"]["i18n"]("dialog.cancel"));
            el46.setAttribute("iconsize", "S");
            el46.setAttribute("type", "button");
            el46.setAttribute("data-type", "cancel");
            el46.setAttribute("tabindex", "0");
            el44.appendChild(el46);
            var el47 = document.createTextNode("\n        ");
            el44.appendChild(el47);
            var el48 = document.createElement("button", "coral-button");
            el48.setAttribute("is", "coral-button");
            el48.setAttribute("icon", "check");
            el48.setAttribute("title", CUI["rte"]["Utils"]["i18n"]("dialog.apply"));
            el48.setAttribute("aria-label", CUI["rte"]["Utils"]["i18n"]("dialog.apply"));
            el48.setAttribute("iconsize", "S");
            el48.setAttribute("variant", "primary");
            el48.setAttribute("type", "button");
            el48.setAttribute("data-type", "apply");
            el48.setAttribute("tabindex", "0");
            el44.appendChild(el48);
            var el49 = document.createTextNode("\n    ");
            el44.appendChild(el49);
            el42.appendChild(el44);
            var el50 = document.createTextNode("\n");
            el42.appendChild(el50);
            frag.appendChild(el42);
            var el51 = document.createTextNode("\n");
            frag.appendChild(el51);
            return frag
        },
        initialize: function(config) {
            this.inherited(arguments);
            this.hrefField = this.$dialog.find("foundation-autocomplete")[0]
        },
        construct: function() {
            window["Coral"]["templates"]["RichTextEditor"]["dlg_" + this.getDataType()] = this.hbTemplate
        },
        dlgToModel: function() {
            this.inherited(arguments);
            if (this.objToEdit && this.isEnableXssFiltering()) {
                var href = this.objToEdit.href;
                href = Granite.URITemplate.expand("{+path}", {
                    "path": href
                });
                href = href.replace(/'/g, "%27");
                this.objToEdit.href = href
            }
        },
        isEnableXssFiltering: function() {
            var isEnable = true;
            if (this.context.root && this.context.root.attributes)
                isEnable = !this.context.root.attributes["data-disablexssfiltering"];
            return isEnable
        },
        getDataType: function() {
            return "link"
        }
    })
}
)(window.jQuery);
(function($) {
    CUI.rte.plugins.CQLinkPlugin = new Class({
        extend: CUI.rte.plugins.LinkPlugin,
        notifyPluginConfig: function(config) {
            this.inherited(arguments);
            var anchorImageUrl = Granite.HTTP.externalize("/libs/clientlibs/granite/richtext/resources/images/anchor.png");
            if (!this.config.anchorEditingStyle)
                this.config.anchorEditingStyle = "width: 11px; min-width: 11px; max-width: 11px; line-height: 12px; overflow: hidden; " + "background: url(" + anchorImageUrl + ") no-repeat bottom left; " + "height: 12px; min-height: 12px; max-height: 12px; padding-right: 3px; display: inline-block;";
            if (!this.config.linkDialogConfig.dialogProperties)
                this.config.linkDialogConfig.dialogProperties = {};
            if (!this.config.linkDialogConfig.dialogProperties.crumbRoot)
                this.config.linkDialogConfig.dialogProperties.crumbRoot = CUI.rte.Utils.i18n("Content");
            if (!this.config.linkDialogConfig.dialogProperties.rootPath)
                this.config.linkDialogConfig.dialogProperties.rootPath = "/content";
            var rootPath = encodeURI(this.config.linkDialogConfig.dialogProperties.rootPath);
            this.config.linkDialogConfig.dialogProperties.pickerSrc = "/mnt/overlay/cq/gui/content/linkpathfield/picker.html{value}";
            this.config.linkDialogConfig.dialogProperties.suggestionSrc = "/mnt/overlay/cq/gui/content/linkpathfield/suggestion{.offset,limit}.html?root\x3d" + rootPath + "\x26filter\x3dhierarchyNotFile{\x26query}";
            this.config.linkDialogConfig.dialogProperties.linkOptionsLoader = this.config.linkDialogConfig.dialogProperties.linkOptionsLoader || function(path, callback) {
                jQuery.get(path + ".pages.json", {
                    predicate: "hierarchyNotFile"
                }, function(data) {
                    var pages = data.pages;
                    var result = [];
                    for (var i = 0; i < pages.length; i++)
                        result.push(pages[i].label);
                    if (callback)
                        callback(result)
                }, "json");
                return false
            }
        },
        getDialogClass: function() {
            return CUI.rte.ui.cui.CQLinkBaseDialog
        }
    })
}
)(window.jQuery);
CUI.rte.plugins.PluginRegistry.register("links", CUI.rte.plugins.CQLinkPlugin);
(function($) {
    CUI.rte.commands.CQTrackLink = new Class({
        toString: "TrackLink",
        extend: CUI.rte.commands.Command,
        addLinkTrackingToDom: function(execDef) {
            var context = execDef.editContext;
            var nodeList = execDef.nodeList;
            var attributes = execDef.value.attributes || {};
            var links = [];
            nodeList.getAnchors(context, links, true);
            if (links.length > 0)
                for (var i = 0; i < links.length; i++)
                    this.applyLinkProperties(links[i].dom, attributes);
            else
                ;
        },
        applyLinkProperties: function(dom, addAttributes) {
            var com = CUI.rte.Common;
            for (var attribName in addAttributes)
                if (addAttributes.hasOwnProperty(attribName)) {
                    var attribValue = addAttributes[attribName];
                    if (attribValue && attribValue.length > 0 && attribValue != CUI.rte.commands.CQTrackLink.REMOVE_ATTRIBUTE)
                        com.setAttribute(dom, attribName, attribValue);
                    else
                        com.removeAttribute(dom, attribName)
                }
        },
        isCommand: function(cmdStr) {
            var cmdLC = cmdStr.toLowerCase();
            return cmdLC == "modifylinktracking"
        },
        getProcessingOptions: function() {
            var cmd = CUI.rte.commands.Command;
            return cmd.PO_SELECTION | cmd.PO_NODELIST
        },
        execute: function(execDef) {
            switch (execDef.command.toLowerCase()) {
            case "modifylinktracking":
                this.addLinkTrackingToDom(execDef);
                break
            }
        },
        queryState: function(selectionDef, cmd) {
            return selectionDef.anchorCount > 0
        }
    });
    CUI.rte.commands.CQTrackLink.REMOVE_ATTRIBUTE = new Object;
    CUI.rte.commands.CommandRegistry.register("tracklinks", CUI.rte.commands.CQTrackLink)
}
)(window.jQuery);
(function($) {
    CUI.rte.ui.cui.CQTrackLinkDialog = new Class({
        extend: CUI.rte.ui.cui.AbstractDialog,
        toString: "TrackLinkDialog",
        template: function anonymous(data_0) {
            var frag = document.createDocumentFragment();
            var data = data_0;
            var el0 = document.createElement("div");
            el0.className = "rte-dialog-columnContainer";
            var el2 = document.createElement("div");
            el2.className = "rte-dialog-column";
            var el4 = document.createElement("coral-checkbox");
            el4.setAttribute("name", "enabled");
            el4.setAttribute("value", "true");
            el4.label.textContent = CUI.rte.Utils.i18n("dialog.tracklink.enabledLabel");
            el2.appendChild(el4);
            el0.appendChild(el2);
            frag.appendChild(el0);
            var el8 = document.createElement("div");
            el8.className = "rte-dialog-columnContainer";
            var el10 = document.createElement("div");
            el10.className = "rte-dialog-column";
            var el11 = document.createTextNode(" ");
            el10.appendChild(el11);
            var el12 = document.createElement("input", "coral-textfield");
            el12.setAttribute("is", "coral-textfield");
            el12.setAttribute("name", "events");
            el12.setAttribute("placeholder", CUI.rte.Utils.i18n("dialog.tracklink.eventsPlaceHolder"));
            el10.appendChild(el12);
            var el13 = document.createTextNode(" ");
            el10.appendChild(el13);
            el8.appendChild(el10);
            frag.appendChild(el8);
            var el16 = document.createElement("div");
            el16.className = "rte-dialog-columnContainer";
            var el18 = document.createElement("div");
            el18.className = "rte-dialog-column";
            var el19 = document.createTextNode(" ");
            el18.appendChild(el19);
            var el20 = document.createElement("input", "coral-textfield");
            el20.setAttribute("is", "coral-textfield");
            el20.setAttribute("name", "evars");
            el20.setAttribute("placeholder", CUI.rte.Utils.i18n("dialog.tracklink.evarsPlaceHolder"));
            el18.appendChild(el20);
            var el21 = document.createTextNode(" ");
            el18.appendChild(el21);
            el16.appendChild(el18);
            frag.appendChild(el16);
            var el24 = document.createElement("div");
            el24.className = "rte-dialog-columnContainer";
            var el26 = document.createElement("div");
            el26.className = "rte-dialog-column rte-dialog-column--rightAligned";
            var el27 = document.createTextNode(" ");
            el26.appendChild(el27);
            var el28 = document.createElement("button", "coral-button");
            el28.setAttribute("is", "coral-button");
            el28.setAttribute("data-type", "cancel");
            el28.setAttribute("icon", "close");
            el28.setAttribute("iconsize", "S");
            el26.appendChild(el28);
            var el29 = document.createTextNode(" ");
            el26.appendChild(el29);
            var el30 = document.createElement("button", "coral-button");
            el30.setAttribute("is", "coral-button");
            el30.setAttribute("data-type", "apply");
            el30.setAttribute("variant", "primary");
            el30.setAttribute("icon", "check");
            el30.setAttribute("iconsize", "S");
            el26.appendChild(el30);
            var el31 = document.createTextNode(" ");
            el26.appendChild(el31);
            el24.appendChild(el26);
            frag.appendChild(el24);
            return frag
        },
        $enabled: null,
        $events: null,
        $evars: null,
        construct: function() {
            if (Coral.templates.RichTextEditor)
                Coral.templates.RichTextEditor["dlg_" + this.getDataType()] = this.template
        },
        getDataType: function() {
            return "tracklinks"
        },
        initialize: function(config) {
            this.inherited(arguments);
            var self = this;
            this.$enabled = this.$container.find("[name\x3d'enabled']");
            this.$events = this.$container.find("[name\x3d'events']");
            this.$evars = this.$container.find("[name\x3d'evars']");
            this.$enabled.on("change", function() {
                self.handleInputFields(this.checked)
            });
            this.$dialog.on("keydown", this.handleKeyDown)
        },
        onShow: function() {
            if (!CUI.rte.Common.ua.isTouch) {
                var self = this;
                window.setTimeout(function() {
                    self.$enabled.focus()
                }, 1)
            }
        },
        preprocessModel: function() {
            if (this.objToEdit && this.objToEdit.dom) {
                this.objToEdit.href = CUI.rte.HtmlRules.Links.getLinkHref(this.objToEdit.dom);
                var com = CUI.rte.Common;
                var attribNames = com.getAttributeNames(this.objToEdit.dom, false);
                for (var i = 0; i < attribNames.length; i++) {
                    var attribName = attribNames[i];
                    var value = com.getAttribute(this.objToEdit.dom, attribName);
                    if (typeof value !== "undefined")
                        this.objToEdit.attributes[attribName] = value
                }
            }
        },
        dlgFromModel: function() {
            if (this.$enabled)
                if (this.objToEdit && this.objToEdit.attributes) {
                    var enabled = this.objToEdit.attributes["adhocenable"] ? true : false;
                    if (typeof this.objToEdit.attributes["adhocenable"] === "undefined")
                        enabled = true;
                    this.$enabled.prop("checked", enabled);
                    this.handleInputFields(enabled)
                }
            if (this.$events) {
                var events = this.objToEdit && this.objToEdit.attributes && this.objToEdit.attributes["adhocevents"] ? this.objToEdit.attributes["adhocevents"] : null;
                this.$events.val(events)
            }
            if (this.$evars) {
                var evars = this.objToEdit && this.objToEdit.attributes && this.objToEdit.attributes["adhocevars"] ? this.objToEdit.attributes["adhocevars"] : null;
                this.$evars.val(evars)
            }
        },
        dlgToModel: function() {
            if (this.objToEdit)
                if (this.$enabled) {
                    var enabled = this.$enabled.prop("checked");
                    if (enabled) {
                        this.objToEdit.attributes["onclick"] = "CQ_Analytics.Sitecatalyst.customTrack(this)";
                        this.objToEdit.attributes["adhocenable"] = "" + enabled;
                        if (this.$events) {
                            var events = this.$events.val();
                            this.objToEdit.attributes["adhocevents"] = events
                        }
                        if (this.$evars) {
                            var evars = this.$evars.val();
                            this.objToEdit.attributes["adhocevars"] = evars
                        }
                    } else {
                        this.objToEdit.attributes["onclick"] = CUI.rte.commands.CQTrackLink.REMOVE_ATTRIBUTE;
                        this.objToEdit.attributes["adhocenable"] = CUI.rte.commands.CQTrackLink.REMOVE_ATTRIBUTE;
                        this.objToEdit.attributes["adhocevents"] = CUI.rte.commands.CQTrackLink.REMOVE_ATTRIBUTE;
                        this.objToEdit.attributes["adhocevars"] = CUI.rte.commands.CQTrackLink.REMOVE_ATTRIBUTE
                    }
                }
        },
        validate: function() {
            return true
        },
        handleInputFields: function(enabled) {
            if (this.$events)
                this.$events.prop("disabled", !enabled);
            if (this.$evars)
                this.$evars.prop("disabled", !enabled)
        },
        handleKeyDown: function(event) {
            event.stopPropagation()
        }
    })
}
)(window.jQuery);
(function($) {
    CUI.rte.plugins.CQTrackLinkPlugin = new Class({
        toString: "TrackLinkPlugin",
        extend: CUI.rte.plugins.Plugin,
        tracklinkDialog: null,
        tracklinkUI: null,
        getFeatures: function() {
            return ["modifylinktracking"]
        },
        initializeUI: function(tbGenerator) {
            var plg = CUI.rte.plugins;
            if (this.isFeatureEnabled("modifylinktracking")) {
                this.tracklinkUI = tbGenerator.createElement("modifylinktracking", this, false, this.getTooltip("modifylinktracking"));
                tbGenerator.addElement("tracklinks", plg.Plugin.SORT_LINKS + 1, this.tracklinkUI, 10);
                tbGenerator.registerIcon("tracklinks#modifylinktracking", "adobeAnalytics")
            }
        },
        notifyPluginConfig: function(pluginConfig) {
            pluginConfig = pluginConfig || {};
            CUI.rte.Utils.applyDefaults(pluginConfig, {
                "features": "*",
                "tracklinkDialogConfig": {
                    "targetConfig": {
                        "mode": "manual"
                    }
                },
                "tooltips": {
                    "modifylinktracking": {
                        "title": CUI.rte.Utils.i18n("plugins.tracklinks.modifylinktrackingTitle"),
                        "text": CUI.rte.Utils.i18n("plugins.tracklinks.modifylinktrackingText")
                    }
                }
            });
            this.config = pluginConfig
        },
        execute: function(cmd, value, env) {
            if (cmd == "modifylinktracking")
                this.modifyLink(env.editContext);
            else
                this.editorKernel.relayCmd(cmd)
        },
        updateState: function(selDef) {
            var hasSingleAnchor = selDef.anchorCount == 1;
            var hasNoAnchor = selDef.anchorCount == 0;
            var selectedNode = selDef.selectedDom;
            var isLinkableObject = false;
            if (selectedNode)
                isLinkableObject = CUI.rte.Common.isTag(selectedNode, CUI.rte.plugins.CQTrackLinkPlugin.TRACKABLE_OBJECTS);
            var isCreateLinkEnabled = hasSingleAnchor || isLinkableObject;
            if (this.tracklinkUI)
                this.tracklinkUI.setDisabled(!isCreateLinkEnabled)
        },
        isHeadless: function(cmd, value) {
            return false
        },
        modifyLink: function(context) {
            var com = CUI.rte.Common;
            var dm = this.editorKernel.getDialogManager();
            if (dm.isShown(this.tracklinkDialog) && dm.toggleVisibility(this.tracklinkDialog)) {
                dm.hide(this.tracklinkDialog);
                return
            }
            var dh = CUI.rte.ui.DialogHelper;
            if (!this.tracklinkDialog || dm.mustRecreate(this.tracklinkDialog)) {
                var dialogConfig = {
                    "configVersion": 1,
                    "defaultDialog": {
                        "dialogClass": {
                            "type": dh.TYPE_DIALOG
                        }
                    },
                    "parameters": {
                        "editorKernel": this.editorKernel,
                        "command": this.pluginId + "#modifylinktracking"
                    }
                };
                this.tracklinkDialog = this.createLinkTrackDialog(dialogConfig)
            }
            var linkToEdit = null;
            var selectionDef = this.editorKernel.analyzeSelection();
            if (selectionDef.anchorCount == 1)
                linkToEdit = selectionDef.anchors[0];
            linkToEdit = linkToEdit || {};
            if (typeof linkToEdit.attributes === "undefined")
                linkToEdit.attributes = {};
            this.tracklinkDialog.initializeEdit(this.editorKernel, linkToEdit, CUI.rte.Utils.scope(this.applyLink, this));
            this.savedRange = CUI.rte.Selection.saveNativeSelection(context);
            dm.show(this.tracklinkDialog)
        },
        applyLink: function(context) {
            var com = CUI.rte.Common;
            var linkObj = this.tracklinkDialog.objToEdit;
            if (linkObj) {
                CUI.rte.Selection.restoreNativeSelection(context, this.savedRange);
                this.editorKernel.relayCmd("modifylinktracking", {
                    "attributes": linkObj.attributes
                })
            }
        },
        createLinkTrackDialog: function(dialogConfig) {
            var context = this.editorKernel.getEditContext();
            var $container = CUI.rte.UIUtils.getUIContainer($(context.root));
            var dialog = new CUI.rte.ui.cui.CQTrackLinkDialog;
            dialog.attach(dialogConfig, $container, this.editorKernel);
            return dialog
        }
    });
    CUI.rte.plugins.CQTrackLinkPlugin.TRACKABLE_OBJECTS = ["a"];
    $(document).ready(function() {
        var wnd = window;
        var doc = document.getElementById("ContentFrame");
        if (doc)
            wnd = doc.contentWindow;
        else
            doc = document;
        doc.onload = function() {
            if (typeof wnd.CQ_Analytics !== "undefined" && typeof wnd.CQ_Analytics.adhocLinkTracking !== "undefined" && wnd.CQ_Analytics.adhocLinkTracking == "true")
                CUI.rte.plugins.PluginRegistry.register("tracklinks", CUI.rte.plugins.CQTrackLinkPlugin)
        }
    })
}
)(window.jQuery);
CUI.rte.plugins.SpellCheckerPlugin = new Class({
    toString: "SpellCheckerPlugin",
    extend: CUI.rte.plugins.AbstractSpellCheckerPlugin,
    doCheckText: function(html, contentPath, successFn, failureFn) {
        var url = this.config.spellcheckerUrl;
        var method = this.config.method;
        var callback = function(jqXHR, textStatus) {
            if (textStatus == "success") {
                var isError = true;
                var spellcheckResults;
                try {
                    if (method == "POST") {
                        if (jqXHR && jqXHR.responseJSON) {
                            spellcheckResults = jqXHR.responseJSON;
                            isError = false
                        }
                    } else if (method == "GET")
                        if (jqXHR && jqXHR.responseText) {
                            spellcheckResults = CUI.rte.Utils.jsonDecode(jqXHR.responseText);
                            isError = false
                        }
                } catch (e) {}
                if (isError)
                    failureFn();
                else
                    successFn(spellcheckResults)
            } else
                failureFn()
        };
        var params = {
            "_charset_": "utf-8",
            "mode": "text",
            "html": "true",
            "text": html,
            "cp": contentPath,
            "json": "true"
        };
        $.ajax({
            method: method,
            url: url,
            data: params,
            complete: callback
        })
    },
    notifyPluginConfig: function(pluginConfig) {
        pluginConfig = pluginConfig || {};
        CUI.rte.Utils.applyDefaults(pluginConfig, {
            "invalidStyle": "border-bottom: dotted red;",
            "invalidClass": null,
            "method": "POST",
            "spellcheckerUrl": "/libs/cq/ui/rte/spellcheck",
            "tooltips": {
                "checktext": {
                    "title": CUI.rte.Utils.i18n("plugins.spellCheck.checkSpellTitle"),
                    "text": CUI.rte.Utils.i18n("plugins.spellCheck.checkSpellText")
                }
            }
        });
        this.config = pluginConfig
    }
});
CUI.rte.plugins.PluginRegistry.register("spellcheck", CUI.rte.plugins.SpellCheckerPlugin);
(function(CUI, ns) {
    var GROUP = "commercelinks";
    var FEATURE = "modifylink";
    var GROUP_FEATURE = GROUP + "#" + FEATURE;
    var TITLE = "Commerce Links";
    var ICON = "tag";
    var LINK_MARKER = "#CommerceLinks";
    var LINK_DIALOG_CONTENTS_BUILDER = Coral.templates.RichTextEditor.dlg_link;
    CUI.rte.plugins.CommerceLinksPlugin = new Class({
        toString: "CommerceLinksPlugin",
        extend: CUI.rte.plugins.Plugin,
        linkDialog: null,
        commerceConfig: null,
        categoryField: null,
        productField: null,
        getFeatures: function() {
            return [FEATURE]
        },
        initializeUI: function(toolbarGenerator) {
            if (this.isFeatureEnabled(FEATURE)) {
                var ui = toolbarGenerator.createElement(FEATURE, this, false, {
                    title: TITLE
                });
                toolbarGenerator.addElement(GROUP, CUI.rte.plugins.Plugin.SORT_LINKS + 1, ui, 10);
                toolbarGenerator.registerIcon(GROUP_FEATURE, ICON)
            }
        },
        execute: function(cmd, value, env) {
            if (cmd === "modifylink")
                this.modifyLink(env.editContext);
            else
                this.editorKernel.relayCmd(cmd)
        },
        updateState: function(selDef) {},
        getDialogClass: function() {
            return null
        },
        isHeadless: function(cmd, value) {
            return false
        },
        modifyLink: function(context) {
            var $jscomp$this = this;
            var dialogManager = this.editorKernel.getDialogManager();
            if (this.linkDialog && dialogManager.isShown(this.linkDialog)) {
                dialogManager.hide(this.linkDialog);
                return
            }
            if (this.commerceConfig)
                this.createDialog(dialogManager, context);
            else {
                var configUrl = ns.getPageInfoLocation() + ".model.cifpickerconfig.json";
                fetch(configUrl).then(function(res) {
                    return res.json()
                }).then(function(json) {
                    $jscomp$this.commerceConfig = json.configurationJson;
                    $jscomp$this.createDialog(dialogManager, context)
                }).catch(function(err) {
                    return console.error(err)
                })
            }
        },
        createDialog: function(dialogManager, context) {
            var self = this;
            var dialogHelper = dialogManager.createDialogHelper();
            window["Coral"]["templates"]["RichTextEditor"]["item_cifcategoryfield"] = function anonymous(data) {
                var frag = document.createDocumentFragment();
                var rteColumn = self.createColumnContainer(frag);
                rteColumn.innerHTML = "\x3ccategory-field/\x3e";
                var categoryField = rteColumn.getElementsByTagName("category-field")[0];
                var targetId = "cifcategoryfield-" + self.fieldId();
                categoryField.setAttribute("id", data.id);
                categoryField.setAttribute("name", "category-uid");
                categoryField.setAttribute("selection-id", "uid");
                categoryField.setAttribute("configs", self.commerceConfig);
                categoryField.setAttribute("target", "[data-target-id\x3d'" + targetId + "']");
                categoryField.addEventListener("change", function(e) {
                    self.handleChangeEvent(e)
                });
                rteColumn.appendChild(categoryField);
                var hidden = document.createElement("input");
                hidden.setAttribute("type", "hidden");
                hidden.setAttribute("data-cif-target", "true");
                hidden.setAttribute("data-target-id", targetId);
                rteColumn.appendChild(hidden);
                return frag
            }
            ;
            window["Coral"]["templates"]["RichTextEditor"]["item_cifproductfield"] = function anonymous(data) {
                var frag = document.createDocumentFragment();
                var rteColumn = self.createColumnContainer(frag);
                rteColumn.innerHTML = "\x3cproduct-field/\x3e";
                var productField = rteColumn.getElementsByTagName("product-field")[0];
                var targetId = "cifproductfield-" + self.fieldId();
                productField.setAttribute("id", data.id);
                productField.setAttribute("name", "product-sku");
                productField.setAttribute("selection-id", "sku");
                productField.setAttribute("configs", self.commerceConfig);
                productField.setAttribute("target", "[data-target-id\x3d'" + targetId + "']");
                productField.addEventListener("change", function(e) {
                    self.handleChangeEvent(e)
                });
                rteColumn.appendChild(productField);
                var hidden = document.createElement("input");
                hidden.setAttribute("type", "hidden");
                hidden.setAttribute("data-cif-target", "true");
                hidden.setAttribute("data-target-id", targetId);
                rteColumn.appendChild(hidden);
                return frag
            }
            ;
            var linkDialogContents = LINK_DIALOG_CONTENTS_BUILDER();
            var titleSection = linkDialogContents.children[1];
            var targetSection = linkDialogContents.children[2];
            window["Coral"]["templates"]["RichTextEditor"]["item_ciflinktitle"] = function anonymous(data) {
                var frag = document.createDocumentFragment();
                var field = titleSection.getElementsByTagName("input")[0];
                field.setAttribute("id", data.id);
                field.dataset.testId = "link-title";
                frag.appendChild(titleSection);
                return frag
            }
            ;
            window["Coral"]["templates"]["RichTextEditor"]["item_ciflinktarget"] = function anonymous(data) {
                var frag = document.createDocumentFragment();
                var field = targetSection.getElementsByTagName("coral-select")[0];
                field.setAttribute("id", data.id);
                field.dataset.testId = "link-target";
                frag.appendChild(targetSection);
                return frag
            }
            ;
            window["Coral"]["templates"]["RichTextEditor"]["item_cifreplacetext"] = function anonymous(data) {
                var frag = document.createDocumentFragment();
                var rteColumn = self.createColumnContainer(frag);
                rteColumn.innerHTML = "\x3ccoral-checkbox/\x3e";
                var checkBox = rteColumn.getElementsByTagName("coral-checkbox")[0];
                var targetId = "cifreplacetext-" + self.fieldId();
                checkBox.setAttribute("id", data.id);
                checkBox.setAttribute("name", "replace-text");
                checkBox.dataset.testId = "replace-text";
                checkBox.appendChild(document.createTextNode("Replace link text"));
                rteColumn.appendChild(checkBox);
                return frag
            }
            ;
            var dialogConfig = {
                configVersion: 1,
                defaultDialog: {
                    dialogClass: {
                        type: "rtedefaultdialog"
                    }
                },
                parameters: {
                    editorKernel: this.editorKernel,
                    command: GROUP_FEATURE,
                    selfDestroy: true
                },
                dialogItems: [{
                    item: {
                        type: "cifcategoryfield",
                        id: "categoryuid"
                    },
                    fromModel: function(obj, field) {
                        self.categoryField = field;
                        if (obj.dom) {
                            var categoryUid = obj.dom.getAttribute("data-category-uid");
                            if (categoryUid)
                                field.setAttribute("value", categoryUid)
                        }
                    },
                    toModel: function(obj, field) {
                        obj.attributes["data-category-uid"] = self.getFieldValue(field)
                    }
                }, {
                    item: {
                        type: "cifproductfield",
                        id: "productsku"
                    },
                    fromModel: function(obj, field) {
                        self.productField = field;
                        if (obj.dom) {
                            var productSku = obj.dom.getAttribute("data-product-sku");
                            if (productSku)
                                field.setAttribute("value", productSku)
                        }
                    },
                    toModel: function(obj, field) {
                        obj.attributes["data-product-sku"] = self.getFieldValue(field)
                    }
                }, {
                    item: {
                        type: "ciflinktitle",
                        id: "link_title"
                    },
                    fromModel: function(obj, field) {
                        var attribValue = CUI.rte.Common.getAttribute(obj.dom, "title");
                        if (attribValue)
                            dialogHelper.setItemValue(field, attribValue);
                        else
                            dialogHelper.setItemValue(field, "")
                    },
                    toModel: function(obj, field) {
                        obj.attributes["title"] = dialogHelper.getItemValue(field)
                    }
                }, {
                    item: {
                        type: "ciflinktarget",
                        id: "link_target"
                    },
                    fromModel: function(obj, field) {
                        var attribValue = CUI.rte.Common.getAttribute(obj.dom, "target");
                        if (attribValue)
                            dialogHelper.setItemValue(field, attribValue);
                        else
                            dialogHelper.setItemValue(field, "")
                    },
                    toModel: function(obj, field) {
                        obj.target = dialogHelper.getItemValue(field)
                    }
                }, {
                    item: {
                        type: "cifreplacetext",
                        id: "replace_text"
                    },
                    fromModel: function(obj, field) {
                        var attribValue = CUI.rte.Common.getAttribute(obj.dom, "data-replace-text");
                        if (attribValue === "true")
                            field.setAttribute("checked", true)
                    },
                    toModel: function(obj, field) {
                        if (field.checked)
                            obj.attributes["data-replace-text"] = "true";
                        else
                            obj.attributes["data-replace-text"] = CUI.rte.commands.Link.REMOVE_ATTRIBUTE
                    }
                }]
            };
            dialogHelper.configure(dialogConfig);
            this.linkDialog = dialogHelper.create();
            var dialog = this.linkDialog.$dialog[0];
            dialog.addEventListener("click", function(e) {
                e.stopPropagation()
            });
            dialog.dataset.testId = "commercelinks-dialog";
            var selection = this.editorKernel.analyzeSelection();
            var linkToEdit = selection && selection.anchorCount === 1 ? selection.anchors[0] : {};
            if (typeof linkToEdit.attributes === "undefined")
                linkToEdit.attributes = {};
            this.linkDialog.initializeEdit(this.editorKernel, linkToEdit, CUI.rte.Utils.scope(this.applyLink, this));
            this.savedRange = CUI.rte.Selection.saveNativeSelection(context);
            dialogHelper.calculateInitialPosition();
            dialogManager.show(this.linkDialog)
        },
        createColumnContainer: function(frag) {
            var rteColumnContainer = document.createElement("div");
            rteColumnContainer.setAttribute("class", "rte-dialog-columnContainer");
            frag.appendChild(rteColumnContainer);
            var rteColumn = document.createElement("div");
            rteColumn.setAttribute("class", "rte-dialog-column");
            rteColumnContainer.appendChild(rteColumn);
            return rteColumn
        },
        applyLink: function(context) {
            var linkObj = this.linkDialog.objToEdit;
            if (linkObj)
                if (linkObj.attributes["data-category-uid"] || linkObj.attributes["data-product-sku"]) {
                    var linkUrl = LINK_MARKER;
                    var cssClass = linkObj.cssClass;
                    var target = linkObj.target;
                    CUI.rte.Selection.restoreNativeSelection(context, this.savedRange);
                    this.editorKernel.relayCmd("modifylink", {
                        url: linkUrl,
                        css: cssClass,
                        target: target,
                        trimLinkSelection: this.config.trimLinkSelection,
                        attributes: linkObj.attributes
                    })
                } else if (LINK_MARKER === linkObj.href)
                    this.editorKernel.relayCmd("unlink")
        },
        getFieldValue: function(field) {
            if (field.getValue)
                return field.getValue();
            var input = this.linkDialog.$dialog[0].querySelector('input[name\x3d"' + field.getAttribute("name") + '"]');
            return input ? input.value : ""
        },
        handleChangeEvent: function(e) {
            if (this.getFieldValue(this.categoryField).trim().length > 0 && this.getFieldValue(this.productField).trim().length > 0)
                if (e.target === this.categoryField)
                    if (this.productField.clear)
                        this.productField.clear();
                    else
                        this.clearField(this.productField);
                else if (e.target === this.productField)
                    if (this.categoryField.clear)
                        this.categoryField.clear();
                    else
                        this.clearField(this.categoryField)
        },
        clearField: function(field) {
            var self = this;
            var parentNode = field.parentNode;
            var tagName = field.tagName;
            var id = field.getAttribute("id");
            var name = field.getAttribute("name");
            var configs = field.getAttribute("configs");
            var target = field.getAttribute("target");
            var selectionId = field.getAttribute("selection-id");
            parentNode.removeChild(field);
            var temp = document.createElement("div");
            temp.innerHTML = "\x3c" + tagName + "/\x3e";
            field = temp.firstElementChild;
            field.setAttribute("id", id);
            field.setAttribute("name", name);
            field.setAttribute("configs", configs);
            field.setAttribute("target", target);
            field.setAttribute("selection-id", selectionId);
            field.addEventListener("change", function(e) {
                self.handleChangeEvent(e)
            });
            parentNode.appendChild(field);
            if ("CATEGORY-FIELD" === tagName)
                this.categoryField = field;
            else
                this.productField = field
        },
        fieldId: function() {
            return (Date.now() * Math.random()).toString(16).substring(0, 6)
        }
    });
    CUI.rte.plugins.PluginRegistry.register(GROUP, CUI.rte.plugins.CommerceLinksPlugin)
}
)(window.CUI, Granite.author);
(function($, ns, channel, window, undefined) {
    var configs = {};
    var mask = undefined;
    var Utils = {
        getViewport: function() {
            return {
                width: document.body.scrollWidth,
                height: document.body.scrollHeight
            }
        },
        calcScreenOrigin: function(context) {
            var content = context.doc.body;
            var ui = document.body;
            return {
                "contentY": content.scrollTop,
                "contentX": content.scrollLeft,
                "mainY": ui.scrollTop,
                "mainX": ui.scrollLeft
            }
        }
    };
    var Mask = new Class({
        $parent: undefined,
        $editable: undefined,
        $parts: [],
        tid: undefined,
        oldRect: undefined,
        editContext: undefined,
        construct: function(config) {
            this.editContext = config.editContext;
            this.$parent = config.$parent;
            this.$editable = config.$editable
        },
        attach: function() {
            if (this.$parts.length > 0)
                this.detach();
            for (var p = 0; p < 4; p++) {
                var $part = $("\x3cdiv\x3e\x3c/div\x3e");
                $part.addClass("rte-mask-part");
                $part.css("position", "absolute");
                $part.css("pointer-events", "auto");
                this.$parent.prepend($part);
                this.$parts.push($part)
            }
            this._calcParts();
            this.tid = window.setTimeout(CUI.rte.Utils.scope(this._checkResize, this), 100)
        },
        detach: function() {
            if (this.tid !== undefined) {
                window.clearTimeout(this.tid);
                this.tid = undefined
            }
            for (var p = 0; p < this.$parts.length; p++) {
                var $part = this.$parts[p];
                $part.remove()
            }
            this.$parts.length = 0
        },
        _position: function($part, x, y, width, height) {
            $part.offset({
                "top": y,
                "left": x,
                "width": width,
                "height": height
            });
            $part.width(width);
            $part.height(height)
        },
        _calcParts: function() {
            var width = this.$editable.width();
            var height = this.$editable.height();
            var offset = this.$editable.offset();
            var x1 = offset.left;
            var y1 = offset.top;
            if (!this.oldRect || this.oldRect.x !== x1 || this.oldRect.y !== y1 || this.oldRect.w !== width || this.oldRect.h !== height) {
                this.oldRect = {
                    x: x1,
                    y: y1,
                    w: width,
                    h: height
                };
                var edOffs = CUI.rte.UIUtils.getEditorOffsets(this.editContext);
                x1 += edOffs.left;
                y1 += edOffs.top;
                var x2 = x1 + width;
                var y2 = y1 + height;
                var vp = Utils.getViewport();
                var maxX = this.$parent.width();
                var maxY = this.$parent.height();
                maxX = Math.max(maxX, vp.width);
                maxY = Math.max(maxY, vp.height);
                var $contentDoc = $(this.editContext.doc.body);
                var contentMaxX = $contentDoc.width() + edOffs.left;
                var contentMaxY = $contentDoc.height() + edOffs.top;
                maxX = Math.max(maxX, contentMaxX);
                maxY = Math.max(maxY, contentMaxY);
                this._position(this.$parts[0], 0, 0, x1, maxY);
                this._position(this.$parts[1], x2, 0, maxX - x2, maxY);
                this._position(this.$parts[2], x1, 0, width, y1);
                this._position(this.$parts[3], x1, y2, width, maxY - y2)
            }
        },
        _checkResize: function() {
            this._calcParts();
            this.tid = window.setTimeout(CUI.rte.Utils.scope(this._checkResize, this), 100)
        },
        on: function(name, fn) {
            this.$parts[0].on(name, fn);
            this.$parts[1].on(name, fn);
            this.$parts[2].on(name, fn);
            this.$parts[3].on(name, fn)
        },
        off: function(name, fn) {
            this.$parts[0].off(name, fn);
            this.$parts[1].off(name, fn);
            this.$parts[2].off(name, fn);
            this.$parts[3].off(name, fn)
        }
    });
    ns.editor.TouchRTE = new Class({
        toString: "TouchRTE",
        extend: CUI.RichText,
        initializeEventHandling: function() {
            var self = this;
            $.toe.off();
            var editContext = this.editorKernel.getEditContext();
            editContext.setState("type", "TouchRTE");
            var body = editContext.doc.body;
            var $body = $(body);
            var $uiBody = $(document.body);
            $body.on("focus.rte", ".rte-toolbar-item", function(e) {
                self.$textContainer.focus();
                e.stopPropagation();
                e.preventDefault()
            });
            this.$textContainer.finger("blur.rte", function(e) {
                if (!self.editorKernel.isLocked())
                    CUI.rte.Utils.defer(function() {
                        if (!self.isTemporaryFocusChange && self.isActive && !self.editorKernel.isLocked())
                            self.finish(false);
                        self.isTemporaryFocusChange = false
                    }, 10);
                else
                    self.isTemporaryFocusChange = false
            });
            CUI.rte.Eventing.on(editContext, body, "keyup", this.handleKeyUp, this);
            $body.finger("click.rte-ooa", CUI.rte.UIUtils.killEvent);
            $uiBody.on("mousedown.rte-item", ".rte-toolbar-item", function(e) {
                CUI.rte.UIUtils.killEvent(e)
            });
            $uiBody.on("mousedown.rte-item", ".rte-toolbar-list button", function(e) {
                CUI.rte.UIUtils.killEvent(e)
            });
            this._handleToolbarOnSelectionChange()
        },
        finalizeEventHandling: function() {
            if (this.editorKernel != null) {
                var context = this.editorKernel.getEditContext();
                var body = context.doc.body;
                var $body = $(body);
                var $uiBody = $(document.body);
                var $doc = $(context.doc);
                CUI.rte.Eventing.un(body, "keyup", this.handleKeyUp, this);
                this.$textContainer.off("blur.rte");
                $body.off("focus.rte click.rte-ooa");
                $uiBody.off("mousedown.rte-item");
                this.$textContainer.off("mousemove.rte-toolbarhide");
                this.$textContainer.off("mouseup.rte-toolbarhide mousedown.rte-toolbarhide");
                $doc.off("selectionchange.rte-toolbarhide")
            }
            $.toe.on()
        },
        start: function() {
            this.inherited(arguments);
            if (this.options.useMask) {
                var self = this;
                mask = new Mask({
                    editContext: this.editorKernel.getEditContext(),
                    $editable: this.$textContainer,
                    $parent: CUI.rte.UIUtils.getUIContainer(this.$textContainer)
                });
                mask.attach();
                mask.on("click.rte-ooa", function() {
                    if (self.isActive && !self.editorKernel.isLocked()) {
                        self.finish(false);
                        self.$textContainer.blur()
                    }
                });
                $(document.body).on("click.rte-ooa", function() {
                    if (self.isActive && !self.editorKernel.isLocked()) {
                        self.finish(false);
                        self.$textContainer.blur()
                    }
                })
            }
            var isFullScreen = !!this.options.isFullScreen;
            if (CUI.rte.Common.ua.isTouch && !isFullScreen) {
                var externalStyleSheetObj = this.originalConfig.externalStyleSheets ? {
                    "externalStyleSheets": this.originalConfig.externalStyleSheets
                } : undefined;
                var oppositeKernel = this.editorKernel.getEditContext().getState("fullscreenadapter").start(externalStyleSheetObj);
                CUI.rte.Utils.defer(oppositeKernel.updateToolbar, 1, oppositeKernel)
            }
        },
        finish: function() {
            if (CUI.rte.Common.ua.isTouch) {
                var tc = this.$textContainer[0];
                var parent = tc.parentNode;
                var nextSib = tc.nextSibling;
                parent.removeChild(tc);
                parent.insertBefore(tc, nextSib)
            }
            if (mask) {
                mask.off("click.rte-ooa");
                mask.detach();
                mask = undefined
            }
            this.inherited(arguments)
        }
    });
    CUI.util.plugClass(ns.editor.TouchRTE, "touchRTE", function(rte) {
        CUI.rte.ConfigUtils.loadConfigAndStartEditing(rte, $(this))
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var TEXT_PROPERTY_NAME_DEFAULT = "text";
    var TABLE_PROPERTY_NAME_DEFAULT = "tableData";
    var ui = {};
    var rCRLF = /\r?\n/g;
    var env = null, scrollViewTopBeforePaste, editorHeightBeforePaste, contentWrapperHeightBeforePaste, fullScreenAdapter;
    function saveEnvironment(dom) {
        var $dom = $(dom);
        var $cq = $dom.find("cq").remove();
        env = {
            $root: $dom,
            $cq: $cq
        }
    }
    function restoreEnvironment() {
        if (env) {
            env.$root.append(env.$cq);
            env = null
        }
    }
    function finish(editable) {
        ui[editable.path].remove();
        delete ui[editable.path];
        channel.off("editor-frame-mode-changed.ipe", onEditModeChange);
        restoreEnvironment()
    }
    function onEditModeChange(event) {
        var data = event.data;
        var editable = data.editable;
        var editor = data.editor;
        editor.finishInlineEdit(editable, editor.rte.getContent(), true)
    }
    var sel = CUI.rte.Selection;
    function getBookmark(rte) {
        var context = rte.editorKernel.getEditContext();
        return sel.createSelectionBookmark(context)
    }
    function selectBookmark(rte, bookmark) {
        var context = rte.editorKernel.getEditContext();
        sel.selectBookmark(context, bookmark)
    }
    function setFullScreenAdapter() {
        this.editorKernel.execCmd("setFullScreenAdapter", fullScreenAdapter)
    }
    function saveScrollStateBeforePaste(e) {
        var com = CUI.rte.Common;
        if (e.type === "paste" && com.ua.isWebKit) {
            scrollViewTopBeforePaste = $("#ContentScrollView").scrollTop();
            contentWrapperHeightBeforePaste = $("#ContentWrapper").height();
            editorHeightBeforePaste = e.editContext.root.offsetHeight
        }
    }
    function handleScrollOnPaste(e) {
        var com = CUI.rte.Common, newScrollTop, heightIncrease;
        if (e.cmd === "paste" && com.ua.isWebKit) {
            heightIncrease = e.editContext.root.offsetHeight - editorHeightBeforePaste;
            newScrollTop = scrollViewTopBeforePaste + heightIncrease;
            $("#ContentWrapper").height(contentWrapperHeightBeforePaste + heightIncrease);
            $("#ContentScrollView").scrollTop(newScrollTop)
        }
    }
    function handleConfig(config, type, componentType) {
        var com = CUI.rte.Common;
        if (type === "uiSettings") {
            if (config.hasOwnProperty("fullscreen")) {
                var fs = config.fullscreen;
                if (fs.hasOwnProperty("toolbar")) {
                    var fsTb = fs.toolbar;
                    if (com.ua.isTouch) {
                        var i = com.arrayIndex(fsTb, "fullscreen#finish");
                        if (i >= 0)
                            fsTb[i] = "control#close";
                        fsTb.push("control#save")
                    }
                }
            }
            if (componentType && componentType === "table" && config.hasOwnProperty("tableEditOptions")) {
                var tableSettings = config.tableEditOptions;
                if (tableSettings.hasOwnProperty("toolbar")) {
                    var tableTb = tableSettings.toolbar;
                    var fullscreenFinishIndex = com.arrayIndex(tableTb, "fullscreen#finish");
                    if (!com.ua.isTouch && fullscreenFinishIndex < 0)
                        tableTb.push("fullscreen#finish")
                }
            }
        }
        return config
    }
    function getPersistedPropertyName(componentType, editable, targetId) {
        var ipeConfig = $.extend(true, {}, editable.config.ipeConfig);
        ipeConfig = targetId ? ipeConfig[targetId] || {} : ipeConfig;
        if (componentType && componentType === "table")
            return ipeConfig.textPropertyName || targetId || TABLE_PROPERTY_NAME_DEFAULT;
        else
            return ipeConfig.textPropertyName || targetId || TEXT_PROPERTY_NAME_DEFAULT
    }
    var FullScreenAdapter = new Class({
        baseRTE: undefined,
        fullScreenRTE: undefined,
        $fullScreenDialog: undefined,
        touchScrollLimiter: undefined,
        extend: CUI.rte.commands.FullScreenAdapter,
        $editor: undefined,
        $toggleButton: undefined,
        $richtextContainer: undefined,
        $sourceEditor: undefined,
        _handleEscape: function() {
            this.finish();
            return true
        },
        construct: function(baseRTE) {
            this.baseRTE = baseRTE
        },
        start: function(adapterConfig) {
            var com = CUI.rte.Common;
            var isTouch = com.ua.isTouch, self = this, $ui, $wrapper;
            var bkm = getBookmark(this.baseRTE);
            if (adapterConfig === undefined)
                adapterConfig = {};
            var allowMinimize = com.ua.isTouch ? false : true;
            adapterConfig.fullscreenDialog = Coral.templates.RichTextEditor["fullscreen_dialog"]({
                "allowMinimize": allowMinimize
            }).childNodes[0];
            this.$fullScreenDialog = ns.editor.fullscreenController.start(null, adapterConfig);
            this.$sourceEditor = this.$fullScreenDialog.find(".rte-sourceEditor");
            this.$richtextContainer = this.$fullScreenDialog.find(".rte-fullscreen-richtextContainer");
            this.$editor = this.$fullScreenDialog.find(".rte-editor");
            this.$toggleButton = this.$fullScreenDialog.find(".rte-fullScreenExit");
            this.$toggleButton.on("click.rte-handler", function(e) {
                var editorKernel = self.fullScreenRTE.editorKernel;
                if (self.sourceEditMode)
                    self.toggleSourceEdit(false);
                var dm = editorKernel.getDialogManager();
                dm.hide();
                var oppositeKernel = self.finish();
                CUI.rte.Utils.defer(oppositeKernel.updateToolbar, 1, oppositeKernel);
                editorKernel.enableFocusHandling();
                e.stopPropagation()
            });
            $wrapper = this.$fullScreenDialog.find(".rte-editorWrapper");
            $ui = $("\x3cdiv/\x3e");
            $ui.addClass("rte-ui");
            this.$sourceEditor.hide();
            this.$richtextContainer.prepend($ui);
            this.$fullScreenDialog[0].show();
            this.$sourceEditor.on("click.rte-" + this.id, function(e) {
                e.stopPropagation()
            });
            this.fullScreenRTE = new CUI.RichText({
                "element": this.$editor,
                "initialContent": this.baseRTE.getContent(),
                "preventCaretInitialize": true,
                "$ui": $ui,
                "isFullScreen": true,
                "autoConfig": true,
                "fullScreenAdapter": this,
                "componentType": this.baseRTE.getComponentType(),
                "listeners": {
                    "beforeEscape": CUI.rte.Utils.scope(this._handleEscape, this),
                    "beforeFinish": function() {
                        self._leaveFromFullScreenMode()
                    },
                    "beforeCancel": function() {
                        self._leaveFromFullScreenMode(true)
                    }
                }
            });
            var undoConfig = this.baseRTE.getUndoConfig();
            this.baseRTE.suspend();
            this.fullScreenRTE.start(CUI.rte.Utils.copyObject(this.baseRTE.originalConfig));
            var ek = this.fullScreenRTE.editorKernel;
            if (com.ua.isGecko || com.ua.isIE)
                ek.initializeCaret(true);
            this.fullScreenRTE.setUndoConfig(undoConfig);
            if (isTouch)
                window.focus();
            this.fullScreenRTE.focus();
            var context = ek.getEditContext();
            this._convertBookmark(bkm, this.baseRTE.editorKernel.getEditContext(), context);
            selectBookmark(this.fullScreenRTE, bkm);
            if (isTouch) {
                this.touchScrollLimiter = new CUI.rte.ui.cui.TouchScrollLimiter;
                this.touchScrollLimiter.attach(this.$fullScreenDialog, $wrapper, this.$editor)
            }
            context.setState("CUI.touchScrollLimiter", this.touchScrollLimiter);
            return ek
        },
        _convertBookmark: function(bkm, fromContext, toContext) {
            var indexPath;
            var com = CUI.rte.Common;
            if (bkm.insertObject) {
                indexPath = com.createIndexPath(fromContext, bkm.insertObject);
                bkm.insertObject = com.getElementByIndexPath(toContext.root, indexPath)
            }
            if (bkm.object) {
                indexPath = com.createIndexPath(fromContext, bkm.object);
                bkm.object = com.getElementByIndexPath(toContext.root, indexPath)
            }
            if (bkm.cells) {
                var cellsCopy = [];
                for (var c = 0; c < bkm.cells.length; c++) {
                    indexPath = com.createIndexPath(fromContext, bkm.cells[c]);
                    cellsCopy.push(com.getElementByIndexPath(toContext.root, indexPath))
                }
                bkm.cells = cellsCopy
            }
        },
        pushValue: function() {
            var v = this.$sourceEditor.val();
            if (!this.sourceEditMode || this.togglingSourceEdit)
                this.fullScreenRTE.editorKernel.setUnprocessedHtml(v)
        },
        syncValue: function() {
            if (!this.sourceEditMode || this.togglingSourceEdit) {
                var html = this.fullScreenRTE.editorKernel.getProcessedHtml();
                this.$sourceEditor.val(html)
            }
        },
        toggleSourceEdit: function(sourceEditMode) {
            this.togglingSourceEdit = true;
            if (sourceEditMode === undefined)
                sourceEditMode = !this.sourceEditMode;
            sourceEditMode = sourceEditMode === true;
            var isChanged = sourceEditMode !== this.sourceEditMode;
            this.sourceEditMode = sourceEditMode;
            var ek = this.fullScreenRTE.editorKernel;
            if (!isChanged)
                return;
            if (this.sourceEditMode) {
                ek.disableFocusHandling();
                ek.notifyBlur();
                ek.disableToolbar(["sourceedit"]);
                this.syncValue();
                this.$editor.hide();
                this.$sourceEditor.show();
                this.$sourceEditor.focus();
                ek.firePluginEvent("sourceedit", {
                    "enabled": true
                }, false)
            } else {
                ek.enableFocusHandling();
                if (this.initialized && !this.disabled)
                    ek.enableToolbar();
                this.$editor.show();
                this.$sourceEditor.hide();
                this.pushValue();
                ek.focus();
                ek.firePluginEvent("sourceedit", {
                    "enabled": false
                }, false)
            }
            this.togglingSourceEdit = false
        },
        _dropFullScreenMode: function() {
            if (this.touchScrollLimiter) {
                this.touchScrollLimiter.detach();
                this.touchScrollLimiter = null
            }
            if (!CUI.rte.Common.ua.isTouch)
                $(window).off("resize.rteFSResize");
            ns.editor.fullscreenController.finish()
        },
        _leaveFromFullScreenMode: function(isCancelled) {
            var content = this.fullScreenRTE.getContent();
            var isTouch = CUI.rte.Common.ua.isTouch;
            this.fullScreenRTE.suspend();
            this.fullScreenRTE = null;
            this._dropFullScreenMode();
            if (!isCancelled)
                this.baseRTE.reactivate(content);
            this.baseRTE.finish(isCancelled);
            this.baseRTE = null;
            if (isTouch)
                $("#ContentFrame")[0].contentWindow.focus()
        },
        finish: function() {
            var bkm = getBookmark(this.fullScreenRTE);
            var content = this.fullScreenRTE.getContent();
            var undoConfig = this.fullScreenRTE.getUndoConfig();
            this.$toggleButton.off("click.rte-handler");
            this.fullScreenRTE.suspend();
            this._dropFullScreenMode();
            this.baseRTE.reactivate(content);
            this._convertBookmark(bkm, this.fullScreenRTE.editorKernel.getEditContext(), this.baseRTE.editorKernel.getEditContext());
            this.fullScreenRTE = null;
            this.baseRTE.setUndoConfig(undoConfig);
            if (CUI.rte.Common.ua.isTouch)
                $("#ContentFrame")[0].contentWindow.focus();
            this.baseRTE.focus();
            selectBookmark(this.baseRTE, bkm);
            return this.baseRTE.editorKernel
        },
        isFullScreen: function() {
            return ns.editor.fullscreenController.isActive()
        }
    });
    ns.editor.InlineTextEditor = function(componentType) {
        var self = this;
        this.componentType = componentType;
        channel.on("inline-edit-start", function(e) {
            var editable = e.editable;
            self.startInlineEdit(editable)
        })
    }
    ;
    ns.editor.InlineTextEditor.prototype.setUp = function(editable, targetId) {
        this.startInlineEdit(editable, targetId)
    }
    ;
    ns.editor.InlineTextEditor.prototype.tearDown = function(editable, targetId) {
        this.finishInlineEdit(editable, targetId)
    }
    ;
    function installFullScreenAdapter() {
        var com = CUI.rte.Common;
        fullScreenAdapter = new FullScreenAdapter(this);
        setFullScreenAdapter.call(this);
        if (com.ua.isWebKit) {
            this.editorKernel.addPluginListener("paste", saveScrollStateBeforePaste, this, null, false, 900);
            this.editorKernel.addPluginListener("commandexecuted", handleScrollOnPaste, this, null, false)
        }
    }
    function onContentRead(self, data, editable, targetId) {
        var property = getPersistedPropertyName(self.componentType, editable, targetId);
        if (property.substring(0, 2) === "./")
            property = property.substring(2);
        var initialContent = "";
        if (data && data[property] != null)
            initialContent = data[property] || "";
        else
            try {
                var dataObj = JSON.parse(data);
                initialContent = dataObj[property] || ""
            } catch (err) {}
        var $uiContainer = $("#InlineEditingUI");
        var configCallBack = null;
        ui[editable.path] = $("\x3cdiv class\x3d'rte-ui coral--dark'\x3e\x3c/div\x3e");
        $uiContainer.show();
        $uiContainer.append(ui[editable.path]);
        var ipeConfig = $.extend(true, {}, editable.config.ipeConfig);
        ipeConfig = targetId ? ipeConfig[targetId] || {} : ipeConfig;
        var $editable = $(editable.dom);
        var subElementQuery = ipeConfig["editElementQuery"];
        if (targetId)
            subElementQuery = subElementQuery ? subElementQuery : "div." + targetId;
        else if (!subElementQuery)
            subElementQuery = ".";
        if (subElementQuery !== ".") {
            var $subEditable = $editable.find(subElementQuery);
            if ($subEditable.length)
                $editable = $subEditable
        }
        $editable.data("config", ipeConfig);
        self.notifyInitialHistoryContent(editable.path, initialContent);
        if (self.componentType && self.componentType === "table") {
            var defaults = {
                "useColPercentage": false,
                "rtePlugins": {
                    "table": {
                        "features": "*",
                        "defaultValues": {
                            "width": "100%"
                        },
                        "editMode": CUI.rte.plugins.TablePlugin.EDITMODE_TABLE
                    }
                }
            };
            configCallBack = function(config) {
                return Granite.Util.applyDefaults({}, defaults, config)
            }
        }
        if (CUI.rte.Common.ua.isTouch)
            self.rte = new ns.editor.TouchRTE({
                "element": $editable,
                "initialContent": initialContent,
                "$ui": ui[editable.path],
                "useMask": true,
                "autoConfig": true,
                "listeners": {
                    "onStarted": installFullScreenAdapter,
                    "onResumed": setFullScreenAdapter
                }
            });
        else
            self.rte = new CUI.RichText({
                "element": $editable,
                "initialContent": initialContent,
                "$ui": ui[editable.path],
                "autoConfig": true,
                "componentType": self.componentType,
                "listeners": {
                    "onStarted": installFullScreenAdapter,
                    "onResumed": setFullScreenAdapter
                }
            });
        saveEnvironment(editable.dom);
        CUI.rte.ConfigUtils.loadConfigAndStartEditing(self.rte, $editable, configCallBack);
        self.rte.editorKernel.setContentPath(editable.path)
    }
    ns.editor.InlineTextEditor.prototype.startInlineEdit = function(editable, targetId) {
        var self = this;
        var asyncRead = !CUI.rte.Common.ua.isTouch
          , xssConfig = {};
        channel.trigger("cq-hide-overlays");
        channel.trigger("inline-edit-before-start");
        channel.on("editor-frame-mode-changed.ipe", {
            "editor": this,
            "editable": editable
        }, onEditModeChange);
        xssConfig["disableXSSFiltering"] = editable.config.ipeConfig.disableXSSFiltering;
        editable.dom.on("editing-finished editing-cancelled", function(e, content) {
            editable.dom.off("editing-finished editing-cancelled");
            var isFinished = e.type === "editing-finished";
            if (isFinished)
                self.finishInlineEdit(editable, content, null, targetId);
            else
                self.cancelInlineEdit(editable)
        });
        ns.history.Manager.setBlocked(true);
        ns.persistence.readParagraphContent(editable, asyncRead, xssConfig).then(function(data) {
            onContentRead(self, data, editable, targetId)
        }).fail(function(data) {
            ns.persistence.updateParagraph(editable, {
                "./sling:resourceType": editable.type
            }).then(function() {
                return ns.persistence.readParagraphContent(editable, asyncRead)
            }).then(function(data) {
                onContentRead(self, data, editable, targetId)
            })
        });
        if (CUI.rte.Common.ua.isTouch)
            self.rte.focus()
    }
    ;
    ns.editor.InlineTextEditor.prototype.finishInlineEdit = function(editable, changedContent, preventModeChange, targetId) {
        var self = this;
        var persistedPropertyName = getPersistedPropertyName(this.componentType, editable, targetId);
        finish(editable);
        var updateObject = {};
        if (changedContent && (typeof changedContent === "string" || changedContent instanceof String))
            changedContent = changedContent.replace(rCRLF, "\r\n");
        updateObject[persistedPropertyName] = changedContent;
        updateObject["textIsRich"] = "true";
        ns.edit.EditableActions.UPDATE.execute(editable, updateObject).always(function(e) {
            ns.selection.select(editable);
            channel.trigger($.Event("inline-edit-finish", {
                editable: editable,
                changedContent: changedContent
            }));
            if (!preventModeChange)
                channel.trigger("cq-show-overlays");
            self.addHistoryStep(editable, changedContent)
        });
        $("#InlineEditingUI").hide();
        ns.history.Manager.setBlocked(false)
    }
    ;
    ns.editor.InlineTextEditor.prototype.notifyInitialHistoryContent = function(path, initialContent) {
        var historyEnabled = ns.history.Manager.isEnabled()
          , self = this;
        if (historyEnabled) {
            self.historyPath = path;
            self.historyInitialContent = initialContent
        }
    }
    ;
    ns.editor.InlineTextEditor.prototype.addHistoryStep = function(editable, persistedContent) {
        var self = this
          , updateProperty = self.componentType && self.componentType === "table" ? "tableData" : "text"
          , originalData = {}
          , changedData = {};
        if (editable) {
            originalData[updateProperty] = self.historyInitialContent;
            originalData["textIsRich"] = true;
            changedData[updateProperty] = persistedContent;
            changedData["textIsRich"] = true;
            if (originalData[updateProperty] !== changedData[updateProperty])
                ns.history.util.Utils.addUpdateParagraphStep(self.historyPath, editable.type, originalData, changedData)
        }
    }
    ;
    ns.editor.InlineTextEditor.prototype.cancelInlineEdit = function(editable, preventModeChange) {
        finish(editable);
        channel.trigger($.Event("inline-edit-cancel", {
            editable: editable
        }));
        if (!preventModeChange)
            channel.trigger("cq-show-overlays")
    }
    ;
    ns.editor.register("text", new ns.editor.InlineTextEditor("text"));
    ns.editor.register("table", new ns.editor.InlineTextEditor("table"));
    var tk = CUI.rte.ui.ToolkitRegistry.get();
    tk.addToolkitData(CUI.rte.ui.ToolkitDefs.CONFIG_ADAPTER, handleConfig)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, window, document, undefined) {
    if (!String.prototype.endsWith)
        String.prototype.endsWith = function(searchString, position) {
            var subjectString = this.toString();
            if (position === undefined || position > subjectString.length)
                position = subjectString.length;
            position -= searchString.length;
            var lastIndex = subjectString.indexOf(searchString, position);
            return lastIndex !== -1 && lastIndex === position
        }
        ;
    if (!Array.from)
        Array.from = function() {
            var toStr = Object.prototype.toString;
            var isCallable = function(fn) {
                return typeof fn === "function" || toStr.call(fn) === "[object Function]"
            };
            var toInteger = function(value) {
                var number = Number(value);
                if (isNaN(number))
                    return 0;
                if (number === 0 || !isFinite(number))
                    return number;
                return (number > 0 ? 1 : -1) * Math.floor(Math.abs(number))
            };
            var maxSafeInteger = Math.pow(2, 53) - 1;
            var toLength = function(value) {
                var len = toInteger(value);
                return Math.min(Math.max(len, 0), maxSafeInteger)
            };
            return function from(arrayLike) {
                var C = this;
                var items = Object(arrayLike);
                if (arrayLike == null)
                    throw new TypeError("Array.from requires an array-like object - not null or undefined");
                var mapFn = arguments.length > 1 ? arguments[1] : void undefined;
                var T;
                if (typeof mapFn !== "undefined") {
                    if (!isCallable(mapFn))
                        throw new TypeError("Array.from: when provided, the second argument must be a function");
                    if (arguments.length > 2)
                        T = arguments[2]
                }
                var len = toLength(items.length);
                var A = isCallable(C) ? Object(new C(len)) : new Array(len);
                var k = 0;
                var kValue;
                while (k < len) {
                    kValue = items[k];
                    if (mapFn)
                        A[k] = typeof T === "undefined" ? mapFn(kValue, k) : mapFn.call(T, kValue, k);
                    else
                        A[k] = kValue;
                    k += 1
                }
                A.length = len;
                return A
            }
        }();
    if (!Math.hypot)
        Math.hypot = function() {
            var y = 0
              , i = arguments.length;
            while (i--)
                y += arguments[i] * arguments[i];
            return Math.sqrt(y)
        }
}
)(jQuery, Granite.author, this, document);
(function($, ns, channel, window) {
    var wcModeCookie = $.cookie("wcmmode");
    if (wcModeCookie !== "edit" && wcModeCookie !== "preview") {
        $.cookie("wcmmode", "edit", {
            path: "/"
        });
        window.location.reload()
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function(window, $, channel, undefined) {
    $.ajaxSetup({
        cache: false
    })
}
)(this, jQuery, jQuery(document));
(function(window, $, channel, undefined) {
    channel = channel || {};
    var allevents = ["cq-content-frame-loaded", "cq-page-info-loaded", "cq-page-design-loaded", "cq-hide-overlays", "cq-show-overlays", "cq-overlays-repositioned", "cq-overlay-hover", "cq-overlay-click", "cq-overlay-slow-dblclick", "cq-overlay-fast-dblclick", "cq-overlay-hold", "cq-overlay-outside-click", "cq-sidepanel-resized", "cq-sidepanel-tab-switched", "cq-inspectable-added", "cq-emulatorbar-toggle", "cq-components-filtered", "cq-components-store-set", "cq-components-store-cleaned", "cq-persistence-before-create", "cq-persistence-before-delete", "cq-persistence-before-update", "cq-persistence-before-copy", "cq-persistence-before-move", "cq-persistence-after-create", "cq-persistence-after-delete", "cq-persistence-after-update", "cq-persistence-after-copy", "cq-persistence-after-move", "cq-layer-activated", "cq-contexthub-toggle", "inline-edit-before-start", "inline-edit-start", "inline-edit-finish", "inline-edit-cancel"];
    window.Granite = window.Granite || {};
    window.Granite.author = window.Granite.author || {};
    Granite.debugComponents = function() {
        var defaultCss = {
            outline: "1px dashed green",
            background: "transparent",
            color: "red",
            overflow: "visible",
            "white-space": "nowrap",
            "z-index": 999999
        }
          , hoverCss = {
            outline: "5px solid red",
            background: "rgba(255, 255, 255, 0.9)"
        }
          , overlay = $(".cq-overlay");
        overlay.css(defaultCss);
        channel.on("mouseenter", ".cq-overlay", function(event) {
            var curTarget = $(event.currentTarget)
              , inspectable = Granite.store.find({
                path: curTarget.data("path")
            })[0];
            overlay.css("outline", "none");
            curTarget.css(hoverCss).html("Path: " + inspectable.path + "\x3cbr/\x3e" + "Type: " + inspectable.type)
        }).on("mouseleave", ".cq-overlay", function(event) {
            var curTarget = $(event.currentTarget);
            overlay.css(defaultCss).html("")
        })
    }
}
)(this, jQuery, jQuery(document));
(function(window, undefined) {
    var lastTime = 0;
    var vendors = ["webkit", "moz"];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + "RequestAnimationFrame"];
        window.cancelAnimationFrame = window[vendors[x] + "CancelAnimationFrame"] || window[vendors[x] + "CancelRequestAnimationFrame"]
    }
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = (new Date).getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() {
                callback(currTime + timeToCall)
            }, timeToCall);
            lastTime = currTime + timeToCall;
            return id
        }
        ;
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id)
        }
}
)(this);
(function(window, undefined) {
    "$:nomunge";
    var $ = window.jQuery || window.Cowboy || (window.Cowboy = {}), jq_throttle;
    $.throttle = jq_throttle = function(delay, no_trailing, callback, debounce_mode) {
        var timeout_id, last_exec = 0;
        if (typeof no_trailing !== "boolean") {
            debounce_mode = callback;
            callback = no_trailing;
            no_trailing = undefined
        }
        function wrapper() {
            var that = this
              , elapsed = +new Date - last_exec
              , args = arguments;
            function exec() {
                last_exec = +new Date;
                callback.apply(that, args)
            }
            function clear() {
                timeout_id = undefined
            }
            if (debounce_mode && !timeout_id)
                exec();
            timeout_id && clearTimeout(timeout_id);
            if (debounce_mode === undefined && elapsed > delay)
                exec();
            else if (no_trailing !== true)
                timeout_id = setTimeout(debounce_mode ? clear : exec, debounce_mode === undefined ? delay - elapsed : delay)
        }
        if ($.guid)
            wrapper.guid = callback.guid = callback.guid || $.guid++;
        return wrapper
    }
    ;
    $.debounce = function(delay, at_begin, callback) {
        return callback === undefined ? jq_throttle(delay, at_begin, false) : jq_throttle(delay, callback, at_begin !== false)
    }
}
)(this);
(function($, ns, channel, window) {
    var DEFAULT_FEATURE_LABEL = "Unspecified Editor";
    var getEditableCount = function() {
        return Granite.author.ContentFrame.getEditables().length
    };
    var getTimeToLoadPageEditor = function(event) {
        var navigationStart = Math.floor(performance.timeOrigin || performance.timing && performance.timing.navigationStart);
        return event.timeStamp - navigationStart
    };
    var getTrackingConfig = function() {
        var trackingMetaTag = document.head.querySelector('meta[name\x3d"foundation.tracking.page"]');
        if (trackingMetaTag)
            return JSON.parse(decodeURI(trackingMetaTag.content));
        return null
    };
    var getEventConfiguration = function(trackingConfig, editableCount, timeToLoadEditor) {
        return {
            element: "editor",
            type: "editables",
            action: "cq-editor-loaded",
            widget: {
                name: "editor",
                type: "editables"
            },
            feature: trackingConfig && trackingConfig.feature || DEFAULT_FEATURE_LABEL,
            attributes: {
                numberOfComponentsEditable: "" + editableCount,
                timeEditorLoaded: "" + timeToLoadEditor
            }
        }
    };
    var trackEvent = function(data) {
        var tracker = $(window).adaptTo("foundation-tracker");
        if (tracker)
            tracker.trackEvent(data)
    };
    var trackEditorLoaded = function(event) {
        var editableCount = getEditableCount();
        var timeToLoadEditor = getTimeToLoadPageEditor(event);
        var trackingConfig = getTrackingConfig();
        trackEvent(getEventConfiguration(trackingConfig, editableCount, timeToLoadEditor))
    };
    channel.one("cq-editor-loaded", trackEditorLoaded);
    ns.editorTracker = {
        trackDeprecated: function(deprecatedFct) {
            var data = {
                element: "editor",
                type: "deprecated_fn",
                action: "deprecated_fn_used",
                widget: {
                    name: "editor",
                    type: "deprecated_fn"
                },
                feature: deprecatedFct
            };
            trackEvent(data)
        },
        __internal__: {
            getEventConfiguration: getEventConfiguration,
            trackEditorLoaded: trackEditorLoaded
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, window, document) {
    var winMode = $("meta[name\x3d'user.preferences.winmode']").attr("content");
    ns.util = ns.util || {};
    var CSS_STYLE_FILTER = ["pointer-events"];
    function parameterMapToString(map) {
        if (!map)
            return "";
        var result = "";
        for (var key in map)
            if (map.hasOwnProperty(key))
                result += key + "\x3d" + map[key] + "\x26";
        if (result.endsWith("\x26"))
            return result.substr(0, result.length - 1);
        return result
    }
    function pathInfoToString() {
        var path = this.resourcePath || "";
        path += this.selectors && this.selectors.length > 0 ? "." + this.selectors.join(".") : "";
        path += this.extension ? "." + this.extension : "";
        path += this.suffix ? "/" + this.suffix : "";
        var parameters = parameterMapToString(this.parameters);
        path += parameters ? "?" + parameters : "";
        return path
    }
    function splitSelectors(input) {
        if (!input || input.length < 1)
            return {
                selectors: [],
                extension: ""
            };
        if (input.indexOf(".") === -1)
            return {
                selectors: [],
                extension: input
            };
        var selectors = input.split(".");
        var extension = selectors.pop();
        return {
            selectors: selectors,
            extension: extension
        }
    }
    function getSlingParts(selectorStr, extension, suffix) {
        var slingParts = selectorStr ? "." + selectorStr : "";
        slingParts += extension ? "." + extension : "";
        slingParts += suffix ? "/" + suffix : "";
        return slingParts
    }
    ns.util.cloneToIndependentNode = function(src) {
        var dest = createElement(src)
          , rect = src.getBoundingClientRect();
        function createElement(src) {
            var node;
            if (src.childNodes.length)
                node = document.createElement("div");
            else
                node = document.createElement(src.tagName);
            return node
        }
        function getStyleAttribute(elem) {
            var cssObj, props = {}, i;
            if ("getComputedStyle"in window) {
                cssObj = window.getComputedStyle(elem, "");
                for (i = 0; i < cssObj.length; i++)
                    props[cssObj.item(i)] = cssObj.getPropertyValue(cssObj.item(i))
            } else if ("currentStyle"in elem) {
                cssObj = elem.currentStyle;
                for (i in cssObj)
                    props[i] = cssObj[i]
            }
            return props
        }
        function copyAttributes(src, dest) {
            for (var i = src.attributes.length - 1; i >= 0; i--)
                dest.setAttribute(src.attributes[i].name, src.attributes[i].value);
            dest.removeAttribute("style");
            var props = getStyleAttribute(src);
            for (var prop in props)
                if (CSS_STYLE_FILTER.indexOf(prop) === -1)
                    dest.style[prop] = props[prop];
            dest.removeAttribute("class")
        }
        function recursiveCopy(src, dest) {
            var node;
            for (var i = 0; i < src.childNodes.length; i++)
                if (src.childNodes[i].nodeType === Node.ELEMENT_NODE) {
                    node = createElement(src.childNodes[i]);
                    dest.appendChild(node);
                    copyAttributes(src.childNodes[i], node);
                    recursiveCopy(src.childNodes[i], node)
                } else if (src.childNodes[i].nodeType === Node.TEXT_NODE) {
                    node = document.createTextNode(src.childNodes[i].textContent);
                    dest.appendChild(node)
                }
        }
        copyAttributes(src, dest);
        recursiveCopy(src, dest);
        dest.style.margin = "0";
        dest.style.width = rect.width + "px";
        dest.style.height = rect.height + "px";
        dest.style.minWidth = "0";
        dest.style.maxWidth = "none";
        dest.style.minHeight = "0";
        dest.style.maxHeight = "none";
        return dest
    }
    ;
    ns.util.positionAt = function(elem, x, y) {
        var halfDivider = 2;
        elem.style.position = "absolute";
        elem.style.left = x - elem.clientWidth / halfDivider + "px";
        elem.style.top = y - elem.clientHeight / halfDivider + "px";
        elem.style.zIndex = "99999"
    }
    ;
    ns.util.resolveProperty = function(obj, path, separator) {
        separator = separator || "/";
        return path.split(separator).reduce(function(prev, curr) {
            return prev ? prev[curr] : undefined
        }, obj)
    }
    ;
    ns.util.sanitizeCQHandler = function(code) {
        var handler;
        try {
            handler = eval("(" + code + ")")
        } catch (ex) {
            handler = $.noop;
            $(document).trigger($.Event("error", {
                message: "Handler of component is invalid",
                exception: ex
            }))
        }
        return handler
    }
    ;
    ns.util.getPathInfo = function(path) {
        if (!path || path.length === 0 || !(typeof path === "string" || path instanceof String))
            return null;
        var dummyOrigin = "http://dummy";
        var url = new URL(path,dummyOrigin);
        var sanitizedPath = url.pathname;
        var $jscomp$destructuring$var0 = extractResourcePath(sanitizedPath, path);
        var resourcePath = $jscomp$destructuring$var0.resourcePath;
        var pathWithoutResource = $jscomp$destructuring$var0.pathWithoutResource;
        var $jscomp$destructuring$var1 = extractSlingArtefacts(pathWithoutResource);
        var selectorsArray = $jscomp$destructuring$var1.selectorsArray;
        var extension = $jscomp$destructuring$var1.extension;
        var suffix = $jscomp$destructuring$var1.suffix;
        var parameterMap = extractParameterMap(url);
        var selectorStr = selectorsArray.join(".");
        var pathInfo = {
            resourcePath: resourcePath,
            selectors: selectorsArray,
            extension: extension,
            suffix: suffix,
            parameters: parameterMap,
            search: url.searchParams,
            selectorStr: selectorStr,
            slingParts: getSlingParts(selectorStr, extension, suffix)
        };
        pathInfo.toString = pathInfoToString.bind(pathInfo);
        return pathInfo;
        function extractResourcePath(path, originalPath) {
            var slingElements = path.split(".");
            var resourcePath = slingElements[0];
            if (url.origin === dummyOrigin) {
                if (!(originalPath[0] === "/"))
                    resourcePath = resourcePath.substr(1)
            } else
                resourcePath = url.origin + resourcePath;
            slingElements.shift();
            var pathWithoutResource = slingElements.join(".");
            return {
                resourcePath: resourcePath,
                pathWithoutResource: pathWithoutResource
            }
        }
        function extractParameterMap(url) {
            var parameterMap = {};
            url.searchParams.forEach(function(value, key) {
                parameterMap[encodeURI(key)] = encodeURI(value)
            });
            return parameterMap
        }
        function extractSlingArtefacts(pathWithoutResource) {
            var selectorsArray = [];
            var extension = "";
            var suffix = "";
            if (pathWithoutResource.length > 0) {
                var slingElementsWithoutResource = pathWithoutResource.split("/");
                var selectorAndExtension = slingElementsWithoutResource[0];
                var selectorSplit = splitSelectors(selectorAndExtension);
                selectorsArray = selectorSplit.selectors;
                extension = selectorSplit.extension;
                slingElementsWithoutResource.shift();
                if (slingElementsWithoutResource.length > 0)
                    suffix = slingElementsWithoutResource.join("/")
            }
            return {
                selectorsArray: selectorsArray,
                extension: extension,
                suffix: suffix
            }
        }
    }
    ;
    ns.util.getSlingResourcePath = function(resourcePath, slingResourcePathReference) {
        if (!resourcePath || ns.util.getPathInfo(resourcePath).slingParts.length > 0)
            return resourcePath;
        if (!slingResourcePathReference)
            slingResourcePathReference = document.location.pathname.replace(/^\/([a-zA-Z0-9._-]+)\.([a-zA-Z]+)/g, "");
        var pathInfo = ns.util.getPathInfo(slingResourcePathReference);
        var path = resourcePath;
        if (pathInfo && pathInfo.slingParts)
            path += pathInfo.slingParts;
        return path
    }
    ;
    ns.util.getWinMode = function() {
        return winMode
    }
    ;
    ns.util.open = function(url) {
        if (winMode === "single")
            window.location.href = url;
        else
            window.open(url)
    }
    ;
    ns.util.htmlToNode = function(html) {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        return wrapper.firstElementChild
    }
    ;
    ns.util.getFirstVisibleTextContent = function(element) {
        var name = element.nodeName.toLowerCase();
        if (name !== "script" && name !== "noscript" && name !== "style")
            for (var i = 0; i < element.childNodes.length; i++) {
                var child = element.childNodes[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    var text = child.textContent;
                    if (text.trim() !== "") {
                        var nextSibling = child.nextSibling;
                        while (nextSibling !== null) {
                            text += nextSibling.textContent;
                            nextSibling = nextSibling.nextSibling
                        }
                        return text.trim()
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    var style = window.getComputedStyle(child);
                    if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== 0) {
                        text = ns.util.getFirstVisibleTextContent(child);
                        if (text)
                            return text
                    }
                }
            }
        return ""
    }
    ;
    ns.util.getPoint = function(event) {
        return event.originalEvent.changedTouches && event.originalEvent.changedTouches.length > 0 ? event.originalEvent.changedTouches[0] : event.originalEvent.touches && event.originalEvent.touches.length > 0 ? event.originalEvent.touches[0] : event.originalEvent
    }
    ;
    ns.util.getClientXY = function(event) {
        var ev = ns.util.getPoint(event);
        return {
            x: ev.clientX,
            y: ev.clientY
        }
    }
    ;
    ns.util.getPageXY = function(event) {
        var ev = ns.util.getPoint(event);
        return {
            x: ev.pageX,
            y: ev.pageY
        }
    }
    ;
    ns.util.getUnique = function(arrayWithDuplicates) {
        var result, auxObj;
        result = [];
        auxObj = {};
        for (var i = 0; i < arrayWithDuplicates.length; i++) {
            var t = arrayWithDuplicates[i];
            if (!auxObj.hasOwnProperty(t)) {
                result.push(t);
                auxObj[t] = true
            }
        }
        return result
    }
    ;
    ns.util.isValidPath = function(path) {
        return path ? path.startsWith("/") && !path.startsWith("//") : false
    }
    ;
    ns.util.getValidURL = function(url) {
        var validURL = null;
        try {
            validURL = new URL(url)
        } catch (err) {}
        return validURL
    }
    ;
    var showDeprecationOnce = {};
    ns.util.deprecationWarningEnabled = null;
    var isFeatureToggleIsEnabledPending = false;
    ns.util.deprecated = function(msg) {
        if (ns.util.deprecationWarningEnabled === null) {
            if (isFeatureToggleIsEnabledPending)
                return;
            try {
                isFeatureToggleIsEnabledPending = true;
                ns.util.deprecationWarningEnabled = Granite.Toggles.isEnabled("ft-cq-4303977")
            } catch (e) {} finally {
                isFeatureToggleIsEnabledPending = false
            }
        }
        var stack = (new Error).stack.split(/ns.util.deprecated.*\n/).pop().split(/\n/);
        var callee = stack[0].replace(/^\s*at /, "");
        var funcName = stack.slice(0, 3).map(function(x) {
            return x.replace(/^\s*at /, "").replace(/( \()?http:\/\/.*/, "")
        }).filter(Boolean).join(" \x3c- ");
        if (!showDeprecationOnce[callee]) {
            if (ns.util.deprecationWarningEnabled)
                console.warn("[Deprecated] Function " + callee + " is deprecated and might be removed in future release. " + (msg || ""));
            showDeprecationOnce[callee] = true;
            ns.editorTracker.trackDeprecated(funcName)
        }
    }
}
)(jQuery, Granite.author, this, document);
(function($, ns, channel, window, undefined) {
    var Store = function(namespace, name) {
        var _getKey = function(key) {
            return namespace + "_" + name + "_" + key
        };
        var save = function($jscomp$destructuring$var2) {
            var $jscomp$destructuring$var3 = $jscomp$destructuring$var2;
            var key = $jscomp$destructuring$var3.key;
            var undoHistory = $jscomp$destructuring$var3.undoHistory;
            window.localStorage.setItem(_getKey(key), undoHistory)
        };
        var get = function(key, callback) {
            callback(window.localStorage.getItem(_getKey(key)))
        };
        return {
            save: save,
            get: get
        }
    };
    ns.clientsidePersistence = function() {
        var self = {};
        var namespace = "authoring";
        self.createStore = function($jscomp$destructuring$var4) {
            var $jscomp$destructuring$var5 = $jscomp$destructuring$var4;
            var name = $jscomp$destructuring$var5.name;
            return Store(namespace, name)
        }
        ;
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.Preferences = function(namespace) {
        namespace = namespace && typeof namespace === "string" && namespace.length > 0 ? namespace : "cq-preferences";
        this.cookie = {
            get: function(name) {
                return $.cookie(name + "." + namespace)
            },
            set: function(name, value) {
                $.cookie(name + "." + namespace, value, {
                    path: Granite.HTTP.externalize("/"),
                    expires: 7
                })
            }
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var CQ = window.CQ || {};
    var searchPathsCache = {};
    CQ.wcm = CQ.wcm || {};
    CQ.WCM = CQ.WCM || {};
    CQ.wcm.EditBase = CQ.wcm.EditBase || {
        "EDIT": "EDIT",
        "ANNOTATE": "ANNOTATE",
        "DELETE": "DELETE",
        "MOVE": "MOVE",
        "COPY": "COPY",
        "INSERT": "INSERT",
        "INLINE_MODE_AUTO": "auto",
        "INLINE_MODE_FORCED": "forced",
        "INLINE_MODE_NEVER": "never",
        "COPYMOVE": "COPYMOVE",
        "EDITDELETE": "EDITDELETE",
        "EDITDELETEINSERT": "EDITDELETEINSERT",
        "EDITCOPYMOVEINSERT": "EDITCOPYMOVEINSERT",
        "EDITCOPYMOVEDELETEINSERT": "EDITCOPYMOVEDELETEINSERT",
        "EDITANNOTATE": "EDITANNOTATE",
        "EDITANNOTATEDELETE": "EDITANNOTATEDELETE",
        "EDITANNOTATECOPYMOVEDELETEINSERT": "EDITANNOTATECOPYMOVEDELETEINSERT",
        "EDITANNOTATECOPYMOVEINSERT": "EDITANNOTATECOPYMOVEINSERT",
        "EDITANNOTATEDELETEINSERT": "EDITANNOTATEDELETEINSERT"
    };
    CQ.WCM.getTopWindow = CQ.WCM.getTopWindow || function() {
        return window
    }
    ;
    function cleanEditableActions(cfg) {
        if (cfg && cfg.editConfig && cfg.editConfig.actions)
            cfg.editConfig.actions = cleanActions(cfg.editConfig.actions);
        if (cfg && cfg.childConfig && cfg.childConfig.actions)
            cfg.childConfig.actions = cleanActions(cfg.childConfig.actions)
    }
    function cleanActions(actions) {
        var cleanedActions = [];
        if (Array.isArray(actions))
            actions.forEach(function(val) {
                var cleanedAction = cleanAction(val);
                if (cleanedAction)
                    cleanedActions.push(cleanedAction)
            });
        return cleanedActions
    }
    function multiply(paths, names) {
        var tmp = new Set(paths)
          , i = 0
          , j = 0;
        for (i; i < paths.length; i++) {
            var path = paths[i];
            for (j = 0; j < names.length; j++) {
                var name = names[j];
                var s = path;
                if (s.length > 0)
                    s += "/";
                s += name;
                tmp.add(s)
            }
        }
        return Array.from(tmp)
    }
    function cleanAction(action) {
        if (typeof action === "string") {
            var actionKey = action.startsWith("CQ.wcm.EditBase.") ? action.substring(action.lastIndexOf(".") + 1) : false;
            if (actionKey && CQ.wcm.EditBase[actionKey])
                return CQ.wcm.EditBase[actionKey];
            else
                return action
        } else if ($.isPlainObject(action))
            return action.handler && {
                name: action.name || action.text,
                handler: ns.util.sanitizeCQHandler(action.handler),
                condition: ns.util.sanitizeCQHandler(action.condition),
                icon: action.icon,
                text: action.text,
                order: action.order
            };
        return false
    }
    function calculateSearchPathsFromSegments(segments, names) {
        var start = 0;
        var end = segments.length - 1;
        var parentPaths = [];
        var searchPaths = [];
        var i;
        while (start < end) {
            var segs = segments[start];
            start = start + 1;
            if (searchPaths.length === 0)
                for (i = 0; i < segs.length; i++) {
                    searchPaths[searchPaths.length] = segs[i];
                    parentPaths[parentPaths.length] = segs[i]
                }
            else {
                var ret = multiply(parentPaths, segs);
                parentPaths = [];
                for (i = 0; i < ret.length; i++)
                    parentPaths[i] = ret[i];
                for (i = 0; i < searchPaths.length; i++)
                    ret[ret.length] = searchPaths[i];
                searchPaths = ret
            }
        }
        searchPaths = multiply(searchPaths, names);
        for (i = 0; i < names.length; i++)
            searchPaths[searchPaths.length] = names[i];
        return searchPaths
    }
    ns.getSegments = function getUniqueSegments(cfg) {
        var searchPath = (typeof cfg === "string" ? cfg : cfg.csp) || "";
        return searchPath.split("/").filter(function notEmpty(segment) {
            return segment.length
        }).map(function segmentToArray(segment) {
            return segment.split("|")
        })
    }
    ;
    ns.calculateSearchPaths = function(cfg) {
        var self = {};
        var searchExpr = typeof cfg == "string" ? cfg : cfg.csp;
        var searchPathsFromCache = searchPathsCache[searchExpr];
        if (searchPathsFromCache)
            return searchPathsFromCache;
        self.names = [];
        self.searchPaths = [];
        var ps = (searchExpr || "").split("/");
        var unique = {};
        var segments = [];
        var i;
        for (i = 0; i < ps.length; i++)
            if (ps[i].length > 0 && !unique[ps[i]]) {
                unique[ps[i]] = true;
                segments[segments.length] = ps[i].split("|")
            }
        if (segments.length > 0) {
            self.names = segments[segments.length - 1];
            self.searchPaths = calculateSearchPathsFromSegments(segments, self.names)
        }
        searchPathsCache[searchExpr] = self.searchPaths;
        return self.searchPaths
    }
    ;
    ns.configCleaner = function(data) {
        var jcrPrefix = "jcr:"
          , cfg = data;
        for (var key in cfg)
            if (cfg.hasOwnProperty(key)) {
                var child = cfg[key];
                if (key === "xtype" || key.length >= jcrPrefix.length && key.substring(0, jcrPrefix.length) === jcrPrefix)
                    delete cfg[key];
                else if ($.isArray(child))
                    for (var c = 0; c < child.length; c++)
                        child[c] = ns.configCleaner(child[c]);
                else if ($.isPlainObject(child))
                    child = ns.configCleaner(child)
            }
        return cfg
    }
    ;
    ns.configParser = function(config) {
        var cfg = !$.isPlainObject(config) ? eval("(" + config + ")") : config;
        if (cfg && cfg.ipeConfig)
            cfg.ipeConfig = ns.configCleaner(cfg.ipeConfig);
        cleanEditableActions(cfg);
        return cfg
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.device = function() {
        var self = {};
        self.isDesktop = function() {
            return $(window).width() >= 1024
        }
        ;
        self.isIpad = navigator.userAgent.match(/iPad/i) != null;
        self.isIOS = navigator.userAgent.match(/(iPad|iPhone|iPod)/i) != null;
        self.isIE9 = navigator.userAgent.match(/MSIE 9.0/) != null;
        self.isIE11 = navigator.userAgent.match(/Trident\/7.0/) != null;
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    if (ns.device.isIOS)
        $(function() {
            channel.on("focusout", "input,textarea", function(ev) {
                window.setTimeout(function() {
                    if (window.scrollY > 0 && window.scrollY <= 20)
                        $(window).scrollTop(0)
                }, 0)
            })
        });
    channel.on("cq-content-frame-loaded", function() {
        ns.ContentFrame.getDocument().children("html").css("overflow", "hidden")
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.designResolver = {};
    function getComponentsForAllMatchingSubpaths(segments, designsForSegment, currentIndex, pathLength, usedSegments, nodeName, result) {
        segments[currentIndex].forEach(function checkTheVariation(csVariationName) {
            var designs = designsForSegment[csVariationName];
            var _usedSegments = usedSegments.slice();
            _usedSegments.push(currentIndex);
            if (designs && designs[nodeName])
                result.push({
                    rank: getRank(segments.length, pathLength, currentIndex + 1, _usedSegments),
                    segments: _usedSegments,
                    nodeContent: designs[nodeName]
                });
            if (designs)
                for (var subtreeIndex = currentIndex + 1; subtreeIndex < segments.length; subtreeIndex++)
                    getComponentsForAllMatchingSubpaths(segments, designs, subtreeIndex, pathLength + 1, _usedSegments, nodeName, result)
        });
        return result
    }
    function getNodeContentsForAllMatchingPaths(segments, designs, nodeName) {
        var accumulatedDesigns = [];
        accumulatedDesigns = getComponentsForAllMatchingSubpaths(segments, designs, 0, 1, [], nodeName, accumulatedDesigns);
        accumulatedDesigns = getComponentsForAllMatchingSubpaths(segments, designs, segments.length - 1, 1, [], nodeName, accumulatedDesigns);
        return accumulatedDesigns
    }
    function getRank(segAvailable, countSegUsed, lastUsed, segUsed) {
        if (countSegUsed === segAvailable)
            return segAvailable * 2;
        else if (lastUsed === segAvailable)
            return segAvailable + countSegUsed + getTieBreaker(segAvailable, segUsed);
        else
            return countSegUsed + getTieBreaker(segAvailable, segUsed)
    }
    function getTieBreaker(segAvailable, segUsed) {
        var tieBreaker = segUsed.reduce(function(accumulator, current) {
            return accumulator + Math.pow(2, current)
        }, 0);
        return tieBreaker / Math.pow(2, segAvailable)
    }
    ns.designResolver.getProperty = function getProperty(editableConfig, designs, propertyName) {
        if (!editableConfig || !designs || !propertyName)
            return null;
        var nodeContentsForAll = getNodeContentsForAllMatchingPaths(ns.getSegments(editableConfig), designs, propertyName);
        if (nodeContentsForAll.length === 0)
            return null;
        return nodeContentsForAll.reduce(function pickBetterDesign(theOne, current) {
            return current.rank > theOne.rank ? current : theOne
        }).nodeContent
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var COMPONENT_TEMPLATE_ID = "editor-component-template";
    var componentTemplateHTML;
    var descriptionURITemplate = "/mnt/overlay/wcm/core/content/sites/components/description.html{+item}";
    function getComponentTemplateConfig(componentConfig) {
        var descriptionUrl = componentConfig.description ? Granite.URITemplate.expand(descriptionURITemplate, {
            item: componentConfig.path
        }) : "";
        return {
            abbreviation: componentConfig.abbreviation,
            config: JSON.stringify(componentConfig),
            group: Granite.I18n.getVar(componentConfig.group),
            icon: componentConfig.icon,
            iconName: componentConfig.iconName,
            iconPath: componentConfig.iconPath,
            path: componentConfig.path,
            title: Granite.I18n.getVar(componentConfig.title),
            descriptionTitle: Granite.I18n.get("Show Description For "),
            descriptionSrc: descriptionUrl
        }
    }
    function getComponentIconChildElement(iconName, iconPath, abbreviation) {
        var componentIconChildElement = null;
        if (iconName)
            componentIconChildElement = (new Coral.Icon).set({
                icon: iconName
            });
        else if (iconPath) {
            componentIconChildElement = document.createElement("img");
            componentIconChildElement.src = iconPath
        } else if (abbreviation)
            componentIconChildElement = (new Coral.Tag).set({
                label: {
                    innerHTML: abbreviation
                },
                size: "M",
                color: "grey"
            });
        return componentIconChildElement
    }
    function getComponentButtonElement(descriptionSrc, descriptionTitle, componentTitle) {
        var buttonElement = (new Coral.Button).set({
            icon: "infoCircle",
            variant: "minimal",
            iconSize: "XS",
            title: descriptionTitle + componentTitle
        });
        buttonElement.className += " foundation-toggleable-control u-coral-pullRight";
        buttonElement.dataset.foundationToggleableControlSrc = descriptionSrc;
        $(buttonElement).find("coral-icon").attr("alt", "");
        return buttonElement
    }
    function renderComponent(componentConfig) {
        var templateConfig = getComponentTemplateConfig(componentConfig);
        var componentElement = $(componentTemplateHTML)[0];
        var componentIconElement = componentElement.querySelector(".editor-ComponentBrowser-component-icon");
        var componentTitleItem = componentElement.querySelector(".editor-ComponentBrowser-component-title .foundation-collection-item-title");
        var componentSubtleTextItem = componentElement.querySelector(".editor-ComponentBrowser-component-title .foundation-layout-util-subtletext");
        componentElement.dataset.path = templateConfig.path;
        componentElement.dataset.title = templateConfig.title;
        componentElement.dataset.group = templateConfig.group;
        componentElement.dataset.param = templateConfig.config;
        var componentIconChildElement = getComponentIconChildElement(templateConfig.iconName, templateConfig.iconPath, templateConfig.abbreviation);
        if (componentIconChildElement !== null)
            componentIconElement.appendChild(componentIconChildElement);
        $(componentIconElement).find("coral-icon").attr("alt", "");
        $(componentIconElement).find("coral-tag").attr("alt", "");
        if (templateConfig.descriptionSrc) {
            var buttonElement = getComponentButtonElement(templateConfig.descriptionSrc, Granite.I18n.getVar(templateConfig.descriptionTitle), templateConfig.title);
            componentElement.insertBefore(buttonElement, componentIconElement.nextSibling)
        }
        componentTitleItem.appendChild(document.createTextNode(Granite.I18n.getVar(templateConfig.title)));
        if (templateConfig.group)
            componentSubtleTextItem.appendChild(document.createTextNode(templateConfig.group));
        return componentElement
    }
    ns.Component = function(componentConfig) {
        var config = componentConfig.nodeName ? $(componentConfig).data("param") : componentConfig;
        this.componentConfig = ns.configParser(config);
        if (this.componentConfig && this.componentConfig.config && this.componentConfig.config.listeners && this.componentConfig.config.listeners.beforeinsert) {
            var val = this.componentConfig.config.listeners["beforeinsert"];
            if (!$.isFunction(val))
                this.componentConfig.config.listeners["beforeinsert"] = ns.util.sanitizeCQHandler(val)
        }
    }
    ;
    ns.Component.prototype.getPath = function() {
        return this.componentConfig.path
    }
    ;
    ns.Component.prototype.getResourceType = function() {
        return this.componentConfig.resourceType
    }
    ;
    ns.Component.prototype.getTitle = function() {
        return this.componentConfig.title
    }
    ;
    ns.Component.prototype.getGroup = function() {
        return this.componentConfig.group
    }
    ;
    ns.Component.prototype.getConfigParams = function() {
        return this.componentConfig.config ? this.componentConfig.config.params : undefined
    }
    ;
    ns.Component.prototype.getExtraParams = function() {
        return this.componentConfig.config ? this.componentConfig.config.extraParams : undefined
    }
    ;
    ns.Component.prototype.setExtraParams = function(params) {
        if (!this.componentConfig.config)
            this.componentConfig.config = {};
        this.componentConfig.config.extraParams = params
    }
    ;
    ns.Component.prototype.getTemplatePath = function() {
        return this.componentConfig.templatePath
    }
    ;
    ns.Component.prototype.getComponentConfig = function() {
        return this.componentConfig
    }
    ;
    ns.Component.prototype.toHtml = function(copy) {
        if (this._html && !copy)
            return this._html;
        var html = $(renderComponent(this.componentConfig))[0];
        if (!copy)
            this._html = html;
        return html
    }
    ;
    ns.Component.prototype.getTypeName = function() {
        return "Component"
    }
    ;
    ns.Component.prototype.getDropTarget = function(id) {
        var droptargets = this.componentConfig.config.dropTarget || [];
        var ret = [];
        for (var i = droptargets.length; i > 0; i--) {
            var dt = droptargets[i - 1];
            if (id && dt.id !== id)
                continue;
            if (id && dt.id === id)
                return dt;
            ret.push(dt)
        }
        return ret.length ? ret : null
    }
    ;
    ns.Component.prototype._executeListener = function(listenerName, parameters) {
        try {
            var listener = this.componentConfig && this.componentConfig.config && this.componentConfig.config.listeners && this.componentConfig.config.listeners[listenerName];
            return listener ? listener.apply(this, parameters) : true
        } catch (e) {
            channel.trigger($.Event("error", {
                message: "An error has occured during " + listenerName + " listener: " + e.message,
                exception: e
            }));
            return false
        }
    }
    ;
    ns.Component.prototype.beforeInsert = function(defaultInsertFunction, parentEditable) {
        return this._executeListener("beforeinsert", arguments)
    }
    ;
    var initComponentTemplate = function() {
        if (componentTemplateHTML)
            return;
        var componentTemplateSource = document.getElementById(COMPONENT_TEMPLATE_ID);
        if (componentTemplateSource !== null)
            componentTemplateHTML = componentTemplateSource.innerHTML
    };
    channel.one("cq-sidepanel-loaded", initComponentTemplate)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var placeholderClass = "cq-placeholder";
    var newComponentClass = "new";
    var sectionClass = "section";
    var newComponentPlaceholderText = Granite.I18n.get("Drag components here");
    ns.Inspectable = function(config, dom) {
        if (!config)
            return;
        this.path = config.path;
        this.type = config.type;
        this.config = config;
        this.dom = dom && dom.length > 0 ? dom : null;
        this.overlay = null;
        this.design = {}
    }
    ;
    ns.Inspectable.prototype.destroy = function() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null
        }
        this.dom = null
    }
    ;
    ns.Inspectable.prototype.hasPlaceholder = function() {
        if (!this.onPage())
            return false;
        if (this.dom.hasClass(newComponentClass))
            return newComponentPlaceholderText;
        var placeholder;
        if (this.dom.hasClass(placeholderClass))
            placeholder = this.dom;
        else if (this.config.editConfig && (this.config.editConfig.dropTarget || this.config.editConfig.inplaceEditingConfig)) {
            var inspectable = this;
            placeholder = inspectable.dom.find("." + placeholderClass).filter(function() {
                return inspectable.dom.is($(this).closest(".cq-Editable-dom"))
            })
        } else
            placeholder = this.dom.find("\x3e ." + placeholderClass);
        return placeholder && placeholder.length ? Granite.I18n.getVar(placeholder.data("emptytext")) : false
    }
    ;
    ns.Inspectable.prototype.hasAction = function() {
        return false
    }
    ;
    ns.Inspectable.prototype.hasActionsAvailable = function() {
        return true
    }
    ;
    ns.Inspectable.prototype.updateConfig = function() {}
    ;
    ns.Inspectable.prototype.getArea = function() {
        if (!this.onPage())
            return null;
        if (!this.dom[0].getBoundingClientRect)
            return {
                top: 0,
                left: 0,
                width: 0,
                height: 0
            };
        var rect = this.dom[0].getBoundingClientRect();
        return {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
        }
    }
    ;
    ns.Inspectable.prototype.onPage = function() {
        return this.dom !== null
    }
    ;
    ns.Inspectable.prototype.getNodeName = function() {
        var p = this.path.split("/");
        return p[p.length - 1]
    }
    ;
    ns.Inspectable.prototype.getResourceTypeName = function() {
        var p = this.type.split("/");
        return p[p.length - 1]
    }
    ;
    ns.Inspectable.prototype.getParentPath = function() {
        var p = this.path;
        return p.substr(0, p.lastIndexOf("/"))
    }
    ;
    ns.Inspectable.prototype.getParentResourceType = function() {
        var parent = ns.editables.getParent(this);
        return parent ? parent.type : undefined
    }
    ;
    ns.Inspectable.prototype.getAllParents = function() {
        var parents = []
          , parent = ns.editables.getParent(this);
        while (parent) {
            parents.push(parent);
            parent = ns.editables.getParent(parent)
        }
        return parents
    }
    ;
    ns.Inspectable.prototype.getTypeName = function() {
        return "Inspectable"
    }
    ;
    ns.Inspectable.prototype.isNewSection = function() {
        var $dom = $(this.dom);
        return $dom.hasClass(newComponentClass) && ($dom.hasClass(sectionClass) || $dom.parent().hasClass(sectionClass))
    }
    ;
    ns.Inspectable.prototype.isRoot = function() {
        return this.isContainer() && !ns.editables.getParent(this)
    }
    ;
    ns.Inspectable.prototype.isRootNewSection = function() {
        var parent = ns.editables.getParent(this);
        return this.isNewSection() && parent && parent.isRoot()
    }
    ;
    ns.Inspectable.prototype.isContainer = function() {
        return this.config && this.config.isContainer
    }
    ;
    ns.Inspectable.prototype.isStructure = function() {
        return !!(this.config && this.config.editConfig && this.config.editConfig.structure)
    }
    ;
    ns.Inspectable.prototype.isStructureLocked = function() {
        return !!(this.config && this.config.editConfig && this.config.editConfig.structureLocked)
    }
    ;
    ns.Inspectable.prototype.store = function() {
        Granite.author.util.deprecated("Use Granite.author.editables.add instead");
        ns.editables.add(this);
        return this
    }
    ;
    ns.Inspectable.prototype.unstore = function() {
        Granite.author.util.deprecated("Use Granite.author.editables.remove instead");
        ns.editables.remove(this);
        return this
    }
    ;
    ns.Inspectable.prototype.getParent = function() {
        Granite.author.util.deprecated("Use Granite.author.editables.getParent instead");
        return ns.editables.getParent(this)
    }
    ;
    ns.Inspectable.prototype.getChildren = function() {
        Granite.author.util.deprecated("Use Granite.author.editables.getChildren instead");
        return ns.editables.getChildren(this)
    }
    ;
    ns.Inspectable.prototype.setSelected = function() {
        Granite.author.util.deprecated("Use overlay.setSelected() instead");
        if (this.overlay)
            this.overlay.setSelected();
        return this
    }
    ;
    ns.Inspectable.prototype.setDisabled = function(condition) {
        Granite.author.util.deprecated("Use overlay.setDisabled(condition) instead");
        if (this.overlay)
            this.overlay.setDisabled(condition);
        return this
    }
    ;
    ns.Inspectable.prototype.setUnselected = function() {
        Granite.author.util.deprecated("Use overlay.setSelected(false) instead");
        if (this.overlay)
            this.overlay.setSelected(false);
        return this
    }
    ;
    ns.Inspectable.prototype.setActive = function() {
        Granite.author.util.deprecated("Use overlay.setActive() instead");
        if (this.overlay)
            this.overlay.setActive();
        return this
    }
    ;
    ns.Inspectable.prototype.setInactive = function() {
        Granite.author.util.deprecated("Use overlay.setActive(false) instead");
        if (this.overlay)
            this.overlay.setActive(false);
        return this
    }
    ;
    ns.Inspectable.prototype.isSelected = function() {
        Granite.author.util.deprecated("Use overlay.isSelected() instead");
        return this.overlay.isSelected()
    }
    ;
    ns.Inspectable.prototype.isActive = function() {
        Granite.author.util.deprecated("Use overlay.isActive() instead");
        return this.overlay.isActive()
    }
    ;
    ns.Inspectable.prototype.isDisabled = function() {
        Granite.author.util.deprecated("Use overlay.isDisabled() instead");
        return this.overlay.isDisabled()
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var dropTargetPrefix = ".cq-dd-";
    var editableDomClass = "cq-Editable-dom";
    var editableDomContainerClass = "cq-Editable-dom--container";
    var defaults = {
        childConfig: {
            actions: ["EDIT", "ANNOTATE", "COPY", "MOVE", "DELETE", "INSERT"]
        },
        editConfig: {
            actions: ["EDIT", "ANNOTATE"],
            deletable: true,
            orderable: true,
            listeners: {
                beforedelete: function(deleteFunction) {},
                beforeedit: function(editFunction, properties) {},
                beforecopy: function(copyFunction) {},
                beforemove: function(moveFunction) {},
                beforechildinsert: function(insertFunction, component) {},
                beforechilddelete: function(deleteFunction, childEditable) {},
                beforechildedit: function(editFunction, properties, childEditable) {},
                beforechildcopy: function(copyFunction, childEditable) {},
                beforechildmove: function(moveFunction, childEditable) {},
                afterdelete: function() {},
                afteredit: function() {},
                aftercopy: function() {},
                afterinsert: function() {},
                aftermove: function() {},
                afterchildinsert: function(childEditable) {},
                afterchilddelete: function(childEditable) {},
                afterchildedit: function(childEditable) {},
                afterchildcopy: function(childEditable) {},
                afterchildmove: function(childEditable) {},
                updatecomponentlist: function(cellSearchPath, allowedComponents, components) {}
            }
        },
        isDropTarget: true
    };
    ns.Editable = ns.util.extendClass(ns.Inspectable, {
        constructor: function(config, dom) {
            if (arguments.length === 1 && !arguments[0].path) {
                var $cqDOM = $(config);
                dom = $cqDOM.parent();
                config = ns.configParser($cqDOM.data("config"))
            }
            ns.Editable.super_.constructor.call(this, config, dom);
            this.design = {};
            this.dropTargets = null;
            this._originalConfig = Granite.Util.applyDefaults({}, config);
            this.updateConfig(config);
            this._adaptDOM()
        },
        getDropTarget: function(id) {
            if (!this.onPage())
                return null;
            var ret = [];
            for (var i = this.dropTargets.length || 0; i > 0; i--) {
                var dt = this.dropTargets[i - 1];
                if (id && dt.id !== id)
                    continue;
                if (!dt.dom || !$.contains(document.documentElement, dt.dom[0])) {
                    var dropTargetDOM = this.dom.find(dropTargetPrefix + dt.id);
                    dt.dom = dropTargetDOM.length === 0 ? this.dom : dropTargetDOM
                }
                if (id && dt.id === id)
                    return dt;
                ret.push(dt)
            }
            return ret.length ? ret : null
        },
        actionsUpdated: function() {
            if (this.isStructureLocked())
                this.config.editConfig.actions = []
        },
        _adaptActions: function() {
            if (this.config && this.config.editConfig)
                if (this.config.editConfig.actions && this.config.editConfig.actions.length > 0) {
                    var editConfig = this.config.editConfig;
                    editConfig.actions = editConfig.actions.map(function(action) {
                        switch (action) {
                        case "EDIT":
                            return ["EDIT", "CONFIGURE", "STYLE", "LAYOUT"];
                        case "EDITANNOTATE":
                            return ["EDIT", "CONFIGURE", "STYLE", "LAYOUT", "ANNOTATE"];
                        case "COPYMOVE":
                            return ["COPY", "CUT", "MOVE"];
                        case "MOVE":
                            return ["CUT", "MOVE"];
                        case "INSERT":
                            return ["INSERT", "PASTE"];
                        default:
                            return [action]
                        }
                    });
                    editConfig.actions = editConfig.actions.reduce(function(a, b) {
                        return a.concat(b)
                    });
                    if (this.actionsUpdated && typeof this.actionsUpdated === "function")
                        this.actionsUpdated()
                }
        },
        _buildConfig: function(servConfig) {
            var result;
            var parent = ns.editables.getParent(this);
            if (parent) {
                var parentChildConfig = {
                    editConfig: parent.config.childConfig ? parent.config.childConfig : {}
                };
                result = Granite.Util.applyDefaults({}, defaults, parentChildConfig, servConfig)
            } else {
                result = Granite.Util.applyDefaults({}, defaults, servConfig);
                if (!servConfig.dialog && !servConfig.editConfig) {
                    result.editConfig = {};
                    result.editConfig.actions = [];
                    result.editConfig.deletable = false;
                    result.editConfig.orderable = false;
                    result.editConfig.listeners = defaults.editConfig.listeners
                }
            }
            this.config = result;
            Object.defineProperty(this.config, "cellSearchPath", {
                get: function() {
                    return ns.calculateSearchPaths(servConfig.csp)
                }
            });
            this._adaptActions()
        },
        _adaptDOM: function() {
            if (this.dom && this.hasActionsAvailable()) {
                this.dom.addClass(editableDomClass);
                if (this.config.isContainer)
                    this.dom.addClass(editableDomContainerClass)
            }
        },
        _loadConfig: function() {
            var cfg = this.config;
            this.path = cfg.path;
            this.slingPath = cfg.slingPath;
            this.type = cfg.type;
            this.name = cfg.path.replace(/(.)+\//, "") || "";
            this.depth = "" + (cfg.path.replace(/\/(.)+\/jcr:content/, "").match(/\//g) || []).length;
            this.dropTargets = (cfg.editConfig ? cfg.editConfig.dropTarget : null) || [];
            cfg.isDropTarget = $.inArray("INSERT", cfg.editConfig.actions) > -1;
            if (cfg.editConfig.actions.length > 0 && ($.inArray("COPY", cfg.editConfig.actions) > -1 || $.inArray("COPYMOVE", cfg.editConfig.actions) > -1 || $.inArray("DELETE", cfg.editConfig.actions) > -1) && $.inArray("GROUP", cfg.editConfig.actions) === -1)
                cfg.editConfig.actions.push("GROUP");
            if (ns.editables.getSelectableParents(this).length !== 0)
                cfg.editConfig.actions.push("PARENT");
            cfg.editConfig.deletable = cfg.editConfig.actions.indexOf("DELETE") !== -1;
            cfg.editConfig.orderable = cfg.editConfig.actions.indexOf("MOVE") !== -1;
            $.each(cfg.editConfig.listeners, function(point, val) {
                if ($.isFunction(val))
                    return true;
                switch (val) {
                case "REFRESH_SELF":
                    cfg.editConfig.listeners[point] = function() {
                        ns.edit.EditableActions.REFRESH.execute(this)
                    }
                    ;
                    break;
                case "REFRESH_PAGE":
                    cfg.editConfig.listeners[point] = function() {
                        ns.ContentFrame.reload()
                    }
                    ;
                    break;
                case "REFRESH_PARENT":
                    cfg.editConfig.listeners[point] = function() {
                        var parent = ns.editables.getParent(this);
                        if (parent)
                            ns.edit.EditableActions.REFRESH.execute(parent)
                    }
                    ;
                    break;
                case "REFRESH_INSERTED":
                    cfg.editConfig.listeners[point] = function() {}
                    ;
                    break;
                default:
                    cfg.editConfig.listeners[point] = ns.util.sanitizeCQHandler(val);
                    break
                }
            });
            cfg.editConfig.actions = cfg.editConfig.actions.filter(function(elem) {
                return elem
            })
        },
        updateConfig: function(config) {
            config = config ? config : this._originalConfig;
            if (config) {
                this._buildConfig(config);
                this._loadConfig()
            }
        },
        canInPlaceEdit: function() {
            var inPlaceEditConfig = this.config.editConfig.inplaceEditingConfig;
            var isActive = inPlaceEditConfig && inPlaceEditConfig.active;
            var inPlaceEditor = inPlaceEditConfig && ns.editor.registry[inPlaceEditConfig.editorType];
            if (inPlaceEditConfig && isActive)
                if (!inPlaceEditor)
                    return false;
                else
                    return !inPlaceEditor.canEdit || inPlaceEditor.canEdit(this);
            else
                return false
        },
        destroy: function() {
            if (this.dropTargets) {
                for (var i = 0; i < this.dropTargets.length; i++)
                    if (this.dropTargets[i].dom)
                        this.dropTargets[i].dom = null;
                this.dropTargets = null
            }
            ns.Editable.super_.destroy.apply(this, arguments)
        },
        isDeletable: function() {
            return !!(this.config.editConfig && this.config.editConfig.deletable)
        },
        isOrderable: function() {
            return !!(this.config.editConfig && this.config.editConfig.orderable)
        },
        hasActionsAvailable: function() {
            var actions = this.config.editConfig.actions.filter(function(action) {
                return action !== "ANNOTATE"
            });
            if (actions.length)
                if (actions.length === 1)
                    if (actions[0] === "EDIT")
                        return this.config.dialog != null;
                    else
                        return true;
                else
                    return true;
            else
                return false
        },
        hasAction: function(actionName) {
            return actionName && this.config && this.config.editConfig && this.config.editConfig.actions && this.config.editConfig.actions.indexOf(actionName.toUpperCase()) !== -1
        },
        getTypeName: function() {
            return "Editable"
        },
        _executeListener: function(listenerName, parameters) {
            try {
                return this.config.editConfig.listeners[listenerName].apply(this, parameters)
            } catch (e) {
                channel.trigger($.Event("error", {
                    message: "An error has occured during " + listenerName + " listener: " + e.message,
                    exception: e
                }));
                return false
            }
        },
        beforeDelete: function(defaultDeleteFunction) {
            return this._executeListener("beforedelete", arguments)
        },
        afterDelete: function() {
            this._executeListener("afterdelete")
        },
        beforeEdit: function(defaultEditFunction, properties) {
            return this._executeListener("beforeedit", arguments)
        },
        afterEdit: function() {
            this._executeListener("afteredit")
        },
        beforeCopy: function(defaultCopyFunction) {
            return this._executeListener("beforecopy", arguments)
        },
        afterCopy: function() {
            this._executeListener("aftercopy")
        },
        beforeMove: function(defaultMoveFunction) {
            return this._executeListener("beforemove", arguments)
        },
        afterMove: function() {
            this._executeListener("aftermove")
        },
        beforeChildInsert: function(defaultChildInsertFunction, component) {
            return this._executeListener("beforechildinsert", arguments)
        },
        beforeChildDelete: function(defaultDeleteFunction, childEditable) {
            return this._executeListener("beforechilddelete", arguments)
        },
        beforeChildEdit: function(defaultEditFunction, properties, childEditable) {
            return this._executeListener("beforechildedit", arguments)
        },
        beforeChildCopy: function(defaultCopyFunction, childEditable) {
            return this._executeListener("beforechildcopy", arguments)
        },
        beforeChildMove: function(defaultMoveFunction) {
            return this._executeListener("beforechildmove", arguments)
        },
        afterChildInsert: function(newEditable) {
            this._executeListener("afterchildinsert", arguments)
        },
        afterChildDelete: function(childEditable) {
            this._executeListener("afterchilddelete", arguments)
        },
        afterChildEdit: function(childEditable) {
            this._executeListener("afterchildedit", arguments)
        },
        afterChildCopy: function(childEditable) {
            this._executeListener("afterchildcopy", arguments)
        },
        afterChildMove: function(childEditable) {
            this._executeListener("afterchildmove", arguments)
        },
        afterInsert: function() {
            this._executeListener("afterinsert")
        },
        updateComponentList: function(allowedComponents, components) {
            this._executeListener("updatecomponentlist", [this.config.policyPath ? this.config.policyPath : this.config.cellSearchPath, allowedComponents, components])
        },
        beforeChildrenRefresh: function() {
            return $.Deferred().resolve()
        },
        refresh: function() {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.REFRESH.execute instead");
            return ns.edit.EditableActions.REFRESH.execute(this)
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui = {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var CORAL_2_ICON_PREFIX = "coral-Icon--";
    ns.ui.coralCompatibility = {
        getIconAttribute: function(iconCssClass) {
            if (!iconCssClass || iconCssClass.length < 1)
                return "";
            if (iconCssClass.indexOf(CORAL_2_ICON_PREFIX) === 0)
                return iconCssClass.substr(CORAL_2_ICON_PREFIX.length);
            return iconCssClass
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var contentDataType;
    ns.ui.EditableAction = ns.util.createClass({
        constructor: function(config) {
            this.execute = config.execute;
            this.condition = config.condition;
            for (var propKey in config)
                if (!this.hasOwnProperty(propKey) && propKey !== "constructor")
                    this[propKey] = config[propKey];
            this._postExecute = function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments);
                return function postExecuteRequestFunction(requestData) {
                    var requestContentPath = $(requestData).find("#Path").text();
                    var dataType = contentDataType && contentDataType.toUpperCase();
                    var postExecuteFunction = self["_postExecute" + (dataType || "HTML")];
                    if (!postExecuteFunction)
                        return function noOp() {}
                        ;
                    return postExecuteFunction.apply(self, [].concat(args, [requestContentPath, requestData]))
                }
            }
        }
    });
    channel.on("cq-contentframe-datatype-set", function(data) {
        contentDataType = data && data.dataType && data.dataType.toLowerCase()
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.ui.ToolbarAction = ns.util.extendClass(ns.ui.EditableAction, {
        constructor: function(config) {
            if (config.handler)
                config.execute = config.handler;
            ns.ui.ToolbarAction.super_.constructor.call(this, config);
            this.name = config.name;
            this.text = config.text;
            this.icon = config.icon;
            this.order = config.order;
            this.isNonMulti = config.isNonMulti;
            this.render = config.render;
            this.shortcut = config.shortcut;
            this.handler = this.execute
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var previousEditable = null;
    var eventListenerHandles = {};
    var DEFAULT_CONFIG = {
        actions: {}
    };
    ns.ui.Toolbar = ns.util.createClass({
        constructor: function(config) {
            var actualConfig = $.extend(true, {}, DEFAULT_CONFIG, config);
            this.dom = channel.find("#EditableToolbar");
            this.isDisabled = false;
            this.config = actualConfig;
            if (!this.config.actions)
                this.config.actions = {};
            this._needRefocus = false;
            this._currentButtons = {};
            this._bindEvents()
        },
        init: function(config) {
            Granite.author.util.deprecated();
            if (config)
                this.config = config;
            if (!this.config.actions)
                this.config.actions = {};
            return this
        },
        destroy: function() {
            this._unbindEvents();
            this.dom.empty()
        },
        _bindEvents: function() {
            var self = this;
            eventListenerHandles["keydown"] = this.handleKeypress.bind(this);
            this.dom.on("click.toolbar", ".cq-editable-action", this.handleEvent.bind(this));
            document.addEventListener("keydown", eventListenerHandles["keydown"], true);
            channel.on("dialog-ready.toolbar inline-edit-before-start.toolbar", function() {
                self.disable()
            });
            channel.on("dialog-closed.toolbar inline-edit-finish.toolbar inline-edit-cancel.toolbar", function() {
                self.enable();
                channel.one("cq-show-overlays.toolbar-restore-focus", function() {
                    self._needRefocus = true
                })
            });
            channel.on("cq-overlays-repositioned.toolbar", this.reposition.bind(this));
            channel.on("cq-interaction-focus.toolbar", function(event) {
                self.open(event.editable)
            });
            channel.on("cq-interaction-blur.toolbar", this.close.bind(this))
        },
        _unbindEvents: function() {
            this.dom.off("click.toolbar", ".cq-editable-action");
            channel.off("dialog-ready.toolbar");
            channel.off("dialog-closed.toolbar");
            channel.off("inline-edit-before-start.toolbar");
            channel.off("inline-edit-finish.toolbar");
            channel.off("inline-edit-cancel.toolbar");
            channel.off("cq-overlays-repositioned.toolbar");
            channel.off("cq-interaction-focus.toolbar");
            channel.off("cq-interaction-blur.toolbar");
            document.removeEventListener("keydown", eventListenerHandles["keydown"], true)
        },
        registerAction: function(name, action) {
            this.config.actions[name] = action
        },
        appendButton: function(editable, name, action) {
            var button;
            if (action.condition && !action.condition(editable))
                return null;
            if (action.handler) {
                button = (new Coral.Button).set({
                    variant: "quiet",
                    title: Granite.I18n.getVar(action.text),
                    type: "button"
                });
                button.setAttribute("data-action", name);
                button.setAttribute("data-path", editable.path);
                button.classList.add("cq-editable-action");
                if (action.icon) {
                    var icon = ns.ui.coralCompatibility.getIconAttribute(action.icon);
                    button.setAttribute("icon", icon)
                } else {
                    button.label.textContent = Granite.I18n.getVar(action.text);
                    button.classList.add("cq-EditableToolbar-text")
                }
                var $button = $(button);
                if (action.render)
                    action.render($button, editable).appendTo(this.dom);
                else
                    $button.appendTo(this.dom);
                this._currentButtons[name] = $button
            }
            return $button
        },
        handleEvent: function(event) {
            if (this.isDisabled)
                return false;
            var target = $(event.currentTarget), path = target.data("path"), action = target.data("action"), param = target.data("param"), editable = ns.editables.find(path)[0], actionObj = this.config.actions[action] || $.grep(editable.config.editConfig.actions, function(item) {
                return item && item.name === action
            })[0], ret;
            event.stopPropagation();
            try {
                ret = actionObj.handler.call(editable, editable, param, target);
                if (ret !== false)
                    this.close()
            } catch (e) {
                channel.trigger($.Event("error", {
                    message: "An error has occured during execution of the selected action: " + e.message,
                    exception: e
                }))
            }
        },
        handleKeypress: function(event) {
            var tabKey = 9;
            var escKey = 27;
            var leftArrowKey = 37;
            var upArrowKey = 38;
            var rightArrowKey = 39;
            var downArrowKey = 40;
            var keyCode = event.which || event.keyCode;
            if (this.dom.length && this._currentEditable && (this.dom.is(event.target) || $.contains(this.dom[0], event.target)))
                if (keyCode === escKey || keyCode === tabKey) {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    this._currentEditable.overlay.dom.focus();
                    this.close();
                    return null
                } else if (keyCode === leftArrowKey || keyCode === upArrowKey || keyCode === rightArrowKey || keyCode === downArrowKey) {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    var buttons = this.dom.find("button");
                    var isNavigateLeft = keyCode === leftArrowKey || keyCode === upArrowKey;
                    var focused = isNavigateLeft ? buttons.length - 1 : 0;
                    buttons.each(function(index, element) {
                        if (document.activeElement === element) {
                            focused = index;
                            $(element).attr("tabindex", "-1")
                        }
                    });
                    var toFocus;
                    if (focused === 0 && isNavigateLeft || focused === buttons.length - 1 && !isNavigateLeft)
                        toFocus = isNavigateLeft ? buttons.length - 1 : 0;
                    else
                        toFocus = isNavigateLeft ? focused - 1 : focused + 1;
                    $(buttons[toFocus]).attr("tabindex", "0").focus();
                    return null
                }
            var self = this
              , key = keyCode >= 48 && keyCode <= 57 || keyCode >= 65 && keyCode <= 90 ? String.fromCharCode(keyCode).toLowerCase() : null
              , keymap = {
                alt: event.altKey,
                shift: event.shiftKey,
                del: event.which === 8,
                ctrl: event.ctrlKey || event.metaKey
            };
            if (key)
                keymap[key] = true;
            $.each(this.config.actions, function(name, obj) {
                var i, map, ret = false, valid = true, unavailableAction;
                if (obj.shortcut && self._currentEditable) {
                    if (typeof obj.shortcut === "string") {
                        map = obj.shortcut.split("+");
                        for (i = 0; i < map.length; i++)
                            if (!keymap[map[i]]) {
                                valid = false;
                                break
                            }
                        if (valid) {
                            unavailableAction = obj.condition && ns.selection.getAllSelected().some(function(editable) {
                                return !obj.condition.call(self, editable)
                            });
                            ret = !unavailableAction && obj.handler.call(self, self._currentEditable)
                        }
                    } else if ($.isFunction(obj.shortcut))
                        ret = obj.shortcut.call(self, self._currentEditable, keymap);
                    if (ret !== false)
                        self.close()
                }
            })
        },
        render: function(editable) {
            var self = this;
            this._currentButtons = {};
            this.dom.empty();
            for (var actionName in this.config.actions)
                if (this.config.actions.hasOwnProperty(actionName))
                    this.config.actions[actionName].name = actionName;
            var actionsObj = this.config.actions;
            var availableActions = this.getAvailableActions(editable);
            var allAvailableActions = _mergeAllAvailableActions(actionsObj, availableActions);
            var sortedActions = this._sortActions(allAvailableActions);
            sortedActions.forEach(function(action, index) {
                self.appendButton(editable, action.name, action)
            });
            self._makeAccessible();
            return this
        },
        _makeAccessible: function() {
            var firstFocusable = 0;
            var hasFocused = false;
            var $buttons = this.dom.find("button");
            $buttons.each(function(index, button) {
                var $button = $(button);
                if (index === firstFocusable) {
                    hasFocused = true;
                    $button.attr("tabindex", "0")
                } else
                    $button.attr("tabindex", "-1");
                if (!hasFocused)
                    firstFocusable += 1
            })
        },
        position: function(editable) {
            this._currentEditable = editable || this._currentEditable;
            if (!this._currentEditable || !this._currentEditable.overlay || !this._currentEditable.overlay.dom)
                return this;
            this.dom.css({
                display: "block",
                top: 0,
                left: 0
            });
            this.dom.position({
                "my": "left bottom-8",
                "at": "left top",
                "of": this._currentEditable.overlay.dom,
                "collision": "flipfit",
                "within": "#ContentScrollView"
            });
            return this
        },
        reposition: function() {
            if (!this._currentEditable || !this._currentEditable.overlay || !this._currentEditable.overlay.dom)
                this.close();
            else {
                this.position(this._currentEditable);
                if (this._needRefocus) {
                    this.focus();
                    this._needRefocus = false
                }
            }
        },
        focus: function() {
            var $buttons = this.dom.find("button:not([disabled])");
            if ($buttons.length) {
                var $tabbables = $buttons.filter(':not([tabindex\x3d"-1"])');
                if ($tabbables.length)
                    $tabbables.first().focus();
                else
                    $buttons.first().focus()
            }
        },
        open: function(editable) {
            if (!editable) {
                if (this.dom)
                    this.dom.show()
            } else {
                this.render(editable);
                this.position(editable)
            }
            this.focus()
        },
        close: function() {
            channel.trigger($.Event("cq-close-toolbar", {
                editable: this._currentEditable
            }));
            this._currentEditable = null;
            if (this.dom)
                this.dom.hide()
        },
        disable: function() {
            previousEditable = this._currentEditable;
            this._currentEditable = null;
            this.isDisabled = true
        },
        enable: function() {
            this._currentEditable = previousEditable;
            previousEditable = null;
            this.isDisabled = false
        },
        getButton: function(name) {
            return this._currentButtons[name]
        },
        checkActionCondition: function(actionName, editable) {
            if (!this.config.actions)
                return false;
            var actionObj = this.config.actions[actionName];
            var extraParams = Array.prototype.slice.call(arguments, 1, arguments.length);
            return actionObj && actionObj.condition && actionObj.condition(editable, extraParams)
        },
        _sortActions: function(allActions) {
            var sorted = [];
            var categories = this._assignActionsToCategories(allActions);
            var first = categories["first"]
              , coreLast = categories["coreLast"]
              , last = categories["last"]
              , relative = categories["relative"]
              , core = categories["core"]
              , unspecified = categories["unspecified"];
            core.sort(function(a, b) {
                return ns.config.toolbarActionOrder.indexOf(a.name) - ns.config.toolbarActionOrder.indexOf(b.name)
            });
            sorted = first.concat(core).concat(unspecified).concat(last).concat(coreLast);
            this._handleRelativeActions(relative, sorted);
            return sorted
        },
        _assignActionsToCategories: function(all) {
            var unspecified = []
              , core = []
              , first = []
              , last = []
              , coreLast = []
              , relative = [];
            all.forEach(function(action) {
                var order = action.order || "";
                order = order.toLowerCase();
                if (order === "first")
                    first.push(action);
                else if (order === "last")
                    if (ns.config.toolbarActionOrder.indexOf(action.name) !== -1)
                        coreLast.push(action);
                    else
                        last.push(action);
                else if (order.indexOf("before ") === 0 || order.indexOf("after ") === 0)
                    relative.push(action);
                else if (ns.config.toolbarActionOrder.indexOf(action.name) !== -1)
                    core.push(action);
                else
                    unspecified.push(action)
            });
            return {
                unspecified: unspecified,
                core: core,
                first: first,
                last: last,
                coreLast: coreLast,
                relative: relative
            }
        },
        _handleRelativeActions: function(relative, target) {
            while (relative.length > 0) {
                var relativeOriginalLength = relative.length;
                this._insertRelativeActions(relative, target);
                if (relativeOriginalLength === relative.length)
                    break
            }
            if (relative.length > 0)
                relative.forEach(function(action) {
                    target.push(action)
                })
        },
        _insertRelativeActions: function(relative, target) {
            var i, j, action, order, relation, orderName;
            for (i = relative.length - 1; i >= 0; i -= 1) {
                action = relative[i];
                order = action.order.split(" ");
                relation = order[0];
                orderName = order[1];
                for (j = 0; j < target.length; j += 1)
                    if (target[j].name === orderName) {
                        target.splice(j + (relation === "before" ? 0 : 1), 0, action);
                        relative.splice(i, 1);
                        break
                    }
            }
        },
        getAvailableActions: function(editable) {
            var editToolbar = this, availableActions;
            if (ns.selection.isSingleSelection())
                availableActions = editable && editable.config && editable.config.editConfig && editable.config.editConfig.actions.filter(function(action) {
                    var actionHandler = editToolbar.config.actions[action] || action;
                    return !(actionHandler.condition && !actionHandler.condition(editable))
                });
            else
                availableActions = ns.selection.getAllSelected().map(function(editable) {
                    return editable && editable.config && editable.config.editConfig && editable.config.editConfig.actions.filter(function(action) {
                        var actionHandler = editToolbar.config.actions[action] || action;
                        return !(actionHandler.condition && !actionHandler.condition(editable))
                    })
                }).reduce(function(previous, current) {
                    return previous.filter(function(previousAction) {
                        if ($.isPlainObject(previousAction)) {
                            var isAllowed = false;
                            current.forEach(function(currentAction) {
                                if ($.isPlainObject(currentAction) && previousAction.hasOwnProperty("name") && currentAction.hasOwnProperty("name") && previousAction.name === currentAction.name)
                                    isAllowed = true
                            });
                            return isAllowed
                        } else
                            return current.indexOf(previousAction) !== -1
                    })
                });
            return availableActions
        }
    });
    function _mergeAllAvailableActions(actionsObj, availableActions) {
        var all = [];
        var actionsObjClone = $.extend(true, {}, actionsObj);
        if (Array.isArray(availableActions))
            availableActions.forEach(function(item) {
                var action;
                if (typeof item !== "string")
                    action = item;
                if (action && typeof action === "object" && action.name)
                    actionsObjClone[action.name] = action
            });
        return Object.values(actionsObjClone)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var overlayClass = "cq-Overlay"
      , overlayComponentClass = "cq-Overlay--component"
      , overlayComponentNameClass = "cq-Overlay--component-name"
      , overlayContainerClass = "cq-Overlay--container"
      , overlayPlaceholderClass = "cq-Overlay--placeholder"
      , overlayDropTargetClass = "cq-droptarget"
      , overlayDraggableClass = "cq-draggable"
      , rootTitle = " [" + Granite.I18n.get("Root") + "]";
    function getComponentTitle(editable) {
        var component = ns.components.find({
            findFirst: true,
            path: new RegExp("(.)*" + editable.type + "$")
        });
        if (component) {
            var title = component.getTitle();
            return title && title.length > 0 ? title : ""
        }
        return ""
    }
    ns.ui.Overlay = function(editable, container) {
        if (!editable || !container)
            return;
        this.dom = this.render(editable);
        container.append(this.dom)
    }
    ;
    ns.ui.Overlay.currentPos = null;
    ns.ui.Overlay.prototype.prepareRendering = function(editable) {
        var disabled = !editable.hasActionsAvailable();
        var orderable = editable.config.editConfig && editable.config.editConfig.orderable;
        var def = {
            disabled: disabled,
            container: editable.config.isContainer,
            orderable: orderable,
            draggable: orderable,
            dropTarget: !disabled && editable.config.isDropTarget,
            placeholder: editable.hasPlaceholder()
        };
        return def
    }
    ;
    ns.ui.Overlay.prototype.renderName = function(editable, dom) {
        var title = Granite.I18n.getVar(getComponentTitle(editable));
        var className = overlayComponentNameClass;
        if (editable.isNewSection()) {
            var parent = ns.editables.getParent(editable);
            if (parent) {
                var parentTitle = Granite.I18n.getVar(getComponentTitle(parent));
                dom.attr("title", editable.isRootNewSection() ? parentTitle + rootTitle : parentTitle)
            }
            return
        }
        if (!ns.editables.getParent(editable))
            title += rootTitle;
        if (title && title.length > 0) {
            dom.attr("title", title);
            var nameEl = dom.find("." + className);
            var domName = $('\x3cspan class\x3d"' + className + '"\x3e' + title + "\x3c/span\x3e");
            if (nameEl.length > 0)
                nameEl.replaceWith(domName);
            else
                dom.append(domName);
            return domName
        }
    }
    ;
    ns.ui.Overlay.prototype.render = function(editable) {
        var placeholder;
        var cssClass = overlayClass + " " + overlayComponentClass;
        var attr = {
            "data-type": editable.getTypeName(),
            "data-path": editable.path,
            "role": "link",
            "tabindex": 0
        };
        this.renderDef = this.prepareRendering(editable);
        cssClass = this.renderDef.container ? cssClass + " " + overlayContainerClass : cssClass;
        cssClass = this.renderDef.orderable ? cssClass + " " + overlayDraggableClass : cssClass;
        cssClass = this.renderDef.disabled ? cssClass + " is-disabled" : cssClass;
        attr.draggable = this.renderDef.draggable;
        cssClass = this.renderDef.dropTarget ? cssClass + " " + overlayDropTargetClass : cssClass;
        placeholder = this.renderDef.placeholder;
        if (placeholder) {
            cssClass += " " + overlayPlaceholderClass;
            attr["data-text"] = placeholder;
            attr["title"] = placeholder
        }
        attr["class"] = cssClass;
        this.dom = $("\x3cdiv/\x3e", attr);
        this.renderName(editable, this.dom);
        return this.dom
    }
    ;
    ns.ui.Overlay.prototype.remove = function() {
        this.dom.remove()
    }
    ;
    ns.ui.Overlay.prototype.recreate = function(editable) {
        var dom = this.render(editable);
        this.dom.replaceWith(dom);
        this.dom = dom
    }
    ;
    ns.ui.Overlay.prototype.position = function(editable, parent) {
        var estate = editable.getArea();
        if (estate) {
            var parentCurrentPos = parent && parent.overlay ? parent.overlay.currentPos : null;
            if (this.currentPos && this.currentPos.top === estate.top && this.currentPos.left === estate.left && this.currentPos.width === estate.width && this.currentPos.height === estate.height && this.currentPos.parent.top === (parentCurrentPos ? parentCurrentPos.top : 0) && this.currentPos.parent.left === (parentCurrentPos ? parentCurrentPos.left : 0))
                return;
            this.dom.css({
                position: "absolute",
                top: parentCurrentPos ? estate.top - parentCurrentPos.top : estate.top,
                left: parentCurrentPos ? estate.left - parentCurrentPos.left : estate.left,
                width: estate.width,
                height: estate.height
            });
            estate.width === 0 || estate.height === 0 ? this.dom.attr("tabindex") === "0" && this.dom.attr("tabindex", "-1") : this.dom.attr("tabindex") === "-1" && this.dom.attr("tabindex", "0");
            this.currentPos = estate;
            this.currentPos.parent = {
                top: parentCurrentPos ? parentCurrentPos.top : 0,
                left: parentCurrentPos ? parentCurrentPos.left : 0
            }
        }
    }
    ;
    ns.ui.Overlay.prototype.setVisible = function(condition) {
        this.dom.toggleClass("is-hidden", condition === false)
    }
    ;
    ns.ui.Overlay.prototype.setDisabled = function(condition) {
        this.dom.toggleClass("is-disabled", condition !== false)
    }
    ;
    ns.ui.Overlay.prototype.setSelected = function(condition) {
        this.dom.toggleClass("is-selected", condition !== false)
    }
    ;
    ns.ui.Overlay.prototype.setActive = function(condition) {
        this.dom.toggleClass("is-active", condition !== false)
    }
    ;
    ns.ui.Overlay.prototype.setHover = function(condition) {
        this.dom.toggleClass("is-hover", condition !== false)
    }
    ;
    ns.ui.Overlay.prototype.isVisible = function() {
        return !this.dom.hasClass("is-hidden")
    }
    ;
    ns.ui.Overlay.prototype.isDisabled = function() {
        return this.dom.hasClass("is-disabled")
    }
    ;
    ns.ui.Overlay.prototype.isSelected = function() {
        return this.dom.hasClass("is-selected")
    }
    ;
    ns.ui.Overlay.prototype.isActive = function() {
        return this.dom.hasClass("is-active")
    }
    ;
    ns.ui.Overlay.prototype.isHover = function() {
        return this.dom.hasClass("is-hover")
    }
    ;
    Object.defineProperty(ns, "Overlay", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.ui.Overlay instead");
            return ns.ui.Overlay
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.ui.Overlay instead");
            ns.ui.Overlay = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.Dialog = function(def) {
        $.extend(this, def || {})
    }
    ;
    ns.ui.Dialog.prototype.getConfig = function() {}
    ;
    ns.ui.Dialog.prototype.getRequestData = function() {
        return {}
    }
    ;
    ns.ui.Dialog.prototype.onOpen = function() {}
    ;
    ns.ui.Dialog.prototype.onReady = function() {}
    ;
    ns.ui.Dialog.prototype.onFocus = function() {}
    ;
    ns.ui.Dialog.prototype.onSuccess = function(editable) {}
    ;
    ns.ui.Dialog.prototype.onClose = function() {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var cuiAlertMarginTop = 8;
    ns.ui.Notification = function(content, type, heading, className) {
        var alert = (new Coral.Alert).set({
            variant: type || "error",
            header: {
                innerHTML: heading || ""
            },
            content: {
                innerHTML: content || ""
            }
        });
        alert.classList.add("editor-notification");
        if (className)
            alert.$.addClass(className);
        this.$dom = alert.$
    }
    ;
    ns.ui.Notification.TYPES = {
        error: "error",
        warning: "warning",
        success: "success",
        help: "help",
        info: "info"
    };
    ns.ui.Notification.prototype.appendTo = function($element) {
        this.$dom.appendTo($element).hide();
        return this
    }
    ;
    ns.ui.Notification.prototype.prependTo = function($element) {
        this.$dom.prependTo($element).hide();
        return this
    }
    ;
    ns.ui.Notification.prototype.addTo = function($element, isFirst) {
        $element.find(".notification-alert").remove();
        if (isFirst)
            return this.prependTo($element);
        else
            return this.appendTo($element)
    }
    ;
    ns.ui.Notification.prototype.slideFrom = function($element, timeout) {
        return this._slideDown($element)._waitAndThenSlideUp($element, timeout)
    }
    ;
    ns.ui.Notification.prototype._slideDown = function($element) {
        this.$dom.show().css({
            top: $element ? $element.height() - cuiAlertMarginTop : 0,
            opacity: 1
        });
        return this
    }
    ;
    ns.ui.Notification.prototype._waitAndThenSlideUp = function($element, timeout) {
        var that = this;
        setTimeout(function() {
            that.$dom.css({
                top: $element ? -$element.height() : 0,
                opacity: 0
            }).on("transitionend webkitTransitionEnd", function() {
                that.$dom.remove()
            })
        }, timeout);
        return this
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.NotificationSlider = function(container, toolbar, isFirst, notificationDuration) {
        this.toolbar = toolbar;
        this.container = container;
        this.isFirst = isFirst ? isFirst : false;
        this.notificationDuration = notificationDuration ? notificationDuration : 5E3
    }
    ;
    ns.ui.NotificationSlider.prototype.notify = function(notificationInfo) {
        var notification = typeof notificationInfo === "string" ? new ns.ui.Notification(notificationInfo) : new ns.ui.Notification(notificationInfo.content,notificationInfo.type,notificationInfo.heading,notificationInfo.closable,notificationInfo.className);
        return notification.addTo(this.container, this.isFirst).slideFrom(this.toolbar, this.notificationDuration)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DISTANCE_THRESHOLD = 5;
    var Interaction = function(opt) {
        this._opt = opt;
        this._interacting = false;
        this._cleanUp();
        this._bindListener()
    };
    Interaction.prototype = {
        _listener: null,
        _bindListener: function() {
            this._listener = {
                down: this._onDown.bind(this),
                move: this._onMove.bind(this),
                up: this._onUp.bind(this),
                cancel: this._onComplete.bind(this),
                touchstart: this._onTouchStart.bind(this)
            };
            $(document).on("mousedown", this._opt.dragOrigin, this._listener.down);
            $(document).on("mousemove", this._listener.move);
            $(document).on("mouseup", this._listener.up);
            $(document).on("mousecancel", this._listener.cancel);
            $(document).on("dragstart", this._opt.dragOrigin, this._preventDefault);
            $(document).on("touchstart", this._opt.dragOrigin, this._listener.touchstart);
            $(document).on("touchmove", this._listener.move);
            $(document).on("touchend", this._listener.up);
            $(document).on("touchcancel", this._listener.cancel)
        },
        _unbindListener: function() {
            $(document).off("mousedown", this._listener.down);
            $(document).off("mousemove", this._listener.move);
            $(document).off("mouseup", this._listener.up);
            $(document).off("mousecancel", this._listener.cancel);
            $(document).off("dragstart", this._preventDefault);
            $(document).off("touchstart", this._opt.dragOrigin, this._listener.touchstart);
            $(document).off("touchmove", this._listener.move);
            $(document).off("touchend", this._listener.up);
            $(document).off("touchcancel", this._listener.cancel)
        },
        _preventDefault: function(event) {
            event.preventDefault()
        },
        _sanitizeEvent: function(event, additionalData) {
            var ev = {
                originalEvent: event.originalEvent
            };
            for (var prop in additionalData)
                ev[prop] = additionalData[prop];
            var page = ns.util.getPageXY(event);
            var client = ns.util.getClientXY(event);
            ev.clientX0 = this._clientX0;
            ev.clientY0 = this._clientY0;
            ev.clientX = client.x;
            ev.clientY = client.y;
            ev.pageX0 = this._pageX0;
            ev.pageY0 = this._pageY0;
            ev.pageX = page.x;
            ev.pageY = page.y;
            ev.originX = this._originX;
            ev.originY = this._originY;
            ev.originalTarget = event.target;
            ev.preventDefault = event.originalEvent.preventDefault.bind(event.originalEvent);
            return ev
        },
        _execute: function(listener, event, additionalData) {
            if (this._opt[listener])
                this._opt[listener](this._sanitizeEvent(event, additionalData || {}))
        },
        _getPoint: function(event) {
            Granite.author.util.deprecated("Use Granite.author.util.getPoint instead");
            return ns.util.getPoint(event)
        },
        _getClientXY: function(event) {
            Granite.author.util.deprecated("Use Granite.author.util.getClientXY instead");
            return ns.util.getClientXY(event)
        },
        _getPageXY: function(event) {
            Granite.author.util.deprecated("Use Granite.author.util.getPageXY instead");
            return ns.util.getPageXY(event)
        },
        _getRect: function(element) {
            var scroll = {
                x: window.scrollX || window.document.documentElement.scrollLeft,
                y: window.scrollY || window.document.documentElement.scrollTop
            }
              , clientRect = element.getBoundingClientRect();
            return clientRect && {
                left: clientRect.left + scroll.x,
                right: clientRect.right + scroll.x,
                top: clientRect.top + scroll.y,
                bottom: clientRect.bottom + scroll.y,
                width: clientRect.width || clientRect.right - clientRect.left,
                height: clientRect.height || clientRect.bottom - clientRect.top
            }
        },
        _findDropTarget: function(event) {
            var validDrop = null, pointer = ns.util.getPageXY(event), element;
            if (this._opt.dropTarget) {
                var dropTargets = Array.prototype.slice.call(document.querySelectorAll(this._opt.dropTarget));
                element = document.elementFromPoint(pointer.x, pointer.y);
                while (element && element.parentNode && element.parentNode !== element.ownerDocument) {
                    if (dropTargets.indexOf(element) > -1) {
                        validDrop = element;
                        break
                    }
                    element = element.parentNode
                }
                return validDrop
            }
            return null
        },
        _cleanUp: function() {
            this._currentDropTarget = null;
            this._clientX0 = null;
            this._clientY0 = null;
            this._pageX0 = null;
            this._pageY0 = null;
            this._originX = null;
            this._originY = null;
            this._hasStarted = false;
            this._downEvent = null;
            this._originElement = null
        },
        _verifyValidDown: function(event) {
            if (event instanceof MouseEvent)
                if ((event.which || event.button) !== 1)
                    return false;
            if (window.TouchEvent && event instanceof TouchEvent)
                if (event.touches.length > 1)
                    return false;
            return true
        },
        _checkAllowFrom: function(delegateTarget, originalTarget) {
            var el = originalTarget;
            if (this._opt.allowFrom) {
                while (el && el.parentNode && el.parentNode !== el.ownerDocument) {
                    if ($(el).is(this._opt.allowFrom))
                        return true;
                    if (el === delegateTarget)
                        return false;
                    el = el.parentNode
                }
                return false
            }
            return true
        },
        _onTouchStart: function(event) {
            if (this._interacting)
                return;
            if (!this._checkAllowFrom(event.currentTarget, event.target))
                return;
            var ev = this._sanitizeEvent(event, {
                currentTarget: event.currentTarget
            }), waitTime;
            function abort() {
                if (waitTime)
                    clearTimeout(waitTime);
                $(document).off("touchend touchcancel", abort);
                $(document).off("touchmove", threshold);
                $(document).off("contextmenu", preventContextMenu)
            }
            function threshold(moveevent) {
                var ptn = ns.util.getPoint(moveevent)
                  , distance = Math.hypot(ev.clientX - ptn.clientX, ev.clientY - ptn.clientY);
                if (distance > DISTANCE_THRESHOLD)
                    abort()
            }
            function preventContextMenu(event) {
                event.preventDefault()
            }
            $(document).on("touchmove", threshold);
            $(document).on("touchend touchcancel", abort);
            $(document).on("contextmenu", preventContextMenu);
            waitTime = setTimeout(function() {
                event.originalEvent.preventDefault();
                abort();
                this._onDown(ev);
                this._onMove(ev)
            }
            .bind(this), 800)
        },
        _onDown: function(event) {
            if (this._interacting)
                return;
            if (!this._verifyValidDown(event.originalEvent))
                return;
            if (!this._checkAllowFrom(event.currentTarget, event.target))
                return;
            var clientXY = ns.util.getClientXY(event);
            var pageXY = ns.util.getPageXY(event);
            this._clientX0 = clientXY.x;
            this._clientY0 = clientXY.y;
            this._pageX0 = pageXY.x;
            this._pageY0 = pageXY.y;
            this._downEvent = event;
            this._originElement = event.currentTarget;
            this._interacting = true
        },
        _onMove: function(event) {
            if (!this._interacting)
                return;
            event.preventDefault();
            var pageXY = ns.util.getPageXY(event);
            this._originX = pageXY.x - this._pageX0;
            this._originY = pageXY.y - this._pageY0;
            var distance = Math.hypot(this._originX, this._originY);
            if (distance < DISTANCE_THRESHOLD)
                return;
            if (!this._hasStarted) {
                this._execute("start", this._downEvent, {
                    type: "start",
                    target: this._originElement
                });
                this._hasStarted = true
            }
            this._execute("move", event, {
                type: "move",
                target: this._originElement
            });
            if (this._opt.dropTarget) {
                var dropTarget = this._findDropTarget(event);
                if (this._currentDropTarget && this._currentDropTarget !== dropTarget) {
                    this._execute("leave", event, {
                        type: "leave",
                        target: this._currentDropTarget,
                        dragTarget: this._originElement
                    });
                    this._currentDropTarget = null
                }
                if (dropTarget && this._currentDropTarget !== dropTarget) {
                    this._currentDropTarget = dropTarget;
                    this._execute("enter", event, {
                        type: "enter",
                        target: this._currentDropTarget,
                        dragTarget: this._originElement
                    })
                }
                if (this._currentDropTarget && this._currentDropTarget === dropTarget)
                    this._execute("over", event, {
                        type: "over",
                        target: this._currentDropTarget,
                        dragTarget: this._originElement
                    })
            }
        },
        _onUp: function(event) {
            if (!this._interacting)
                return;
            if (this._hasStarted)
                if (this._opt.dropTarget) {
                    var dropTarget = this._findDropTarget(event);
                    if (dropTarget) {
                        this._currentDropTarget = dropTarget;
                        this._execute("drop", event, {
                            type: "drop",
                            target: this._currentDropTarget,
                            dragTarget: this._originElement
                        })
                    }
                }
            this._onComplete(event)
        },
        _onComplete: function(event) {
            if (!this._interacting)
                return;
            if (this._hasStarted)
                this._execute("end", event, {
                    type: "end",
                    target: this._originElement
                });
            this._cleanUp();
            this._interacting = false
        },
        destroy: function() {
            this._unbindListener()
        }
    };
    ns.ui.Interaction = Interaction
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.RTEInteraction = ns.util.extendClass(ns.ui.Interaction, {
        _contextDocument: document,
        _isActive: false,
        _checkIfActive: function(f, event) {
            if (!this._isActive)
                return;
            f.call(this, event)
        },
        _bindListener: function() {
            channel.on("inline-edit-before-start", function(e) {
                this._isActive = true
            }
            .bind(this));
            $("#OverlayWrapper").on("mouseover.rteinteraction", function(e) {
                this._isActive = false
            }
            .bind(this));
            this._listener = {
                down: this._checkIfActive.bind(this, this._onDown),
                move: this._checkIfActive.bind(this, this._onMove),
                up: this._checkIfActive.bind(this, this._onUp),
                cancel: this._checkIfActive.bind(this, this._onComplete),
                touchstart: this._checkIfActive.bind(this, this._onTouchStart),
                contextSwitch: this._checkIfActive.bind(this, this._onContextSwitch)
            };
            $(document).on("mousedown", this._opt.dragOrigin, this._listener.down);
            $(document).on("mouseup", this._listener.up);
            var that = this;
            channel.on("cq-content-frame-loaded", function() {
                var frameDocument = ns.ContentFrame.getDocument();
                frameDocument.on("mouseenter", that._listener.contextSwitch);
                frameDocument.on("mouseleave", that._listener.contextSwitch);
                frameDocument.on("mousedown", that._opt.dragOrigin, that._listener.down);
                frameDocument.on("mousemove", that._listener.move);
                frameDocument.on("mouseup", that._listener.up);
                frameDocument.on("mousecancel", that._listener.cancel);
                frameDocument.on("dragstart", that._opt.dragOrigin, that._preventDefault);
                channel.on("cq-content-frame-unload", function() {
                    that._unbindContentFrameListener()
                })
            })
        },
        _unbindListener: function() {
            $(document).off("mousedown", this._listener.down);
            $(document).off("mouseup", this._listener.down);
            this._unbindContentFrameListener()
        },
        _unbindContentFrameListener: function() {
            var frameDocument = ns.ContentFrame.getDocument();
            frameDocument.off("mouseenter", this._listener.contextSwitch);
            frameDocument.off("mouseleave", this._listener.contextSwitch);
            frameDocument.off("mousedown", this._listener.down);
            frameDocument.off("mousemove", this._listener.move);
            frameDocument.off("mouseup", this._listener.up);
            frameDocument.off("mousecancel", this._listener.cancel);
            frameDocument.off("dragstart", this._preventDefault)
        },
        _onDown: function(event) {
            ns.ui.RTEInteraction.super_._onDown.call(this, event);
            event.preventDefault()
        },
        _findDropTarget: function(event) {
            var validDrop = null, pointer = ns.util.getPageXY(event), element;
            if (this._opt.dropTarget) {
                var dropTargets = Array.prototype.slice.call(this._contextDocument.querySelectorAll(this._opt.dropTarget));
                var element = this._contextDocument.elementFromPoint(pointer.x, pointer.y);
                while (element && element.parentNode && element.parentNode !== element.ownerDocument) {
                    if (dropTargets.indexOf(element) > -1) {
                        validDrop = element;
                        break
                    }
                    element = element.parentNode
                }
                return validDrop
            }
            return null
        },
        _onContextSwitch: function(event) {
            if (event.type == "mouseenter") {
                this._contextDocument = Granite.author.ContentFrame.getDocument()[0];
                ns.ui.dropController.disable({
                    general: true,
                    file: true,
                    filewidget: true,
                    dropareawidget: true
                })
            } else {
                this._contextDocument = document;
                ns.ui.dropController.enable({
                    general: true,
                    file: true,
                    filewidget: true,
                    dropareawidget: true
                })
            }
            this._execute("contextSwitch", event, {
                type: "contextSwitch",
                target: this._originElement,
                newContext: this._contextDocument
            })
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DRAG_ORIGIN_SELECTOR = ".cq-draggable";
    var DROP_TARGET_SELECTOR = ".js-cq-droptarget--enabled";
    var DROP_TARGET_COMPONENT_SELECTOR = ".cq-Overlay.cq-droptarget";
    var DROP_TARGET_ASSET_SELECTOR = ".cq-Overlay-subdroptarget.cq-droptarget";
    var DROP_TARGET_ENABLED_CSSCLASS = "js-cq-droptarget--enabled";
    var DROP_TARGET_INPUTWIDGET_SELECTOR = ".cq-FileUpload";
    var DROP_TARGET_DROPAREA_WIDGET_SELECTOR = ".js-cq-DropArea";
    var DROP_TARGET_AUTOCOMPLETE_WIDGET_SELECTOR = ".foundation-autocomplete-droppable";
    var DROP_TARGET_RTE_WIDGET_SELECTOR = ".cq-RichText-editable";
    var DROP_TARGET_RTE_INLINE_SELECTOR = ".is-edited";
    var INSERT_AFTER_MINHEIGHT = 50;
    function enableGeneral(ctx) {
        ctx._interactionHandler.general = new ns.ui.Interaction({
            dragOrigin: DRAG_ORIGIN_SELECTOR,
            dropTarget: DROP_TARGET_SELECTOR,
            start: ctx.general.onStart,
            move: ctx.general.onMove,
            end: ctx.general.onEnd,
            enter: ctx.general.onEnter,
            over: ctx.general.onOver,
            leave: ctx.general.onLeave,
            drop: ctx.general.onDrop
        })
    }
    function enableFileWidget(ctx) {
        ctx._interactionHandler.filewidget = new ns.ui.Interaction({
            dragOrigin: DRAG_ORIGIN_SELECTOR,
            dropTarget: DROP_TARGET_INPUTWIDGET_SELECTOR,
            enter: ctx.inputwidget.onEnter,
            over: ctx.inputwidget.onOver,
            leave: ctx.inputwidget.onLeave,
            drop: ctx.inputwidget.onDrop,
            start: ctx.inputwidget.onStart,
            end: ctx.inputwidget.onEnd
        })
    }
    function enableDropAreaWidget(ctx) {
        ctx._interactionHandler.dropareawidget = new ns.ui.Interaction({
            dragOrigin: DRAG_ORIGIN_SELECTOR,
            dropTarget: DROP_TARGET_DROPAREA_WIDGET_SELECTOR,
            enter: ctx.dropareawidget.onEnter,
            over: ctx.dropareawidget.onOver,
            leave: ctx.dropareawidget.onLeave,
            drop: ctx.dropareawidget.onDrop,
            start: ctx.dropareawidget.onStart,
            end: ctx.dropareawidget.onEnd
        })
    }
    function enableAutocompleteWidget(ctx) {
        ctx._interactionHandler.autocomplete = new ns.ui.Interaction({
            dragOrigin: DRAG_ORIGIN_SELECTOR,
            dropTarget: DROP_TARGET_AUTOCOMPLETE_WIDGET_SELECTOR,
            enter: ctx.autocomplete.onEnter,
            over: ctx.autocomplete.onOver,
            leave: ctx.autocomplete.onLeave,
            drop: ctx.autocomplete.onDrop,
            start: ctx.autocomplete.onStart,
            end: ctx.autocomplete.onEnd
        })
    }
    function enableRTEWidget(ctx) {
        ctx._interactionHandler.rtewidget = new ns.ui.Interaction({
            dragOrigin: DRAG_ORIGIN_SELECTOR,
            dropTarget: DROP_TARGET_RTE_WIDGET_SELECTOR,
            enter: ctx.rtewidget.onEnter,
            over: ctx.rtewidget.onOver,
            leave: ctx.rtewidget.onLeave,
            drop: ctx.rtewidget.onDrop,
            start: ctx.rtewidget.onStart,
            end: ctx.rtewidget.onEnd
        })
    }
    function enableRTEInline(ctx) {
        ctx._interactionHandler.rteinline = new ns.ui.RTEInteraction({
            dragOrigin: DRAG_ORIGIN_SELECTOR,
            dropTarget: DROP_TARGET_RTE_INLINE_SELECTOR,
            contextSwitch: ctx.rteinline.onContextSwitch,
            start: ctx.rteinline.onStart,
            move: ctx.rteinline.onMove,
            end: ctx.rteinline.onEnd,
            enter: ctx.rteinline.onEnter,
            over: ctx.rteinline.onOver,
            leave: ctx.rteinline.onLeave,
            drop: ctx.rteinline.onDrop
        })
    }
    function enableFile(ctx) {
        if (ctx.file.available)
            channel.on("dragenter", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onEnter).on("dragleave", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onLeave).on("dragover", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onOver).on("drop", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onDrop)
    }
    function disableGeneral(ctx) {
        ctx._interactionHandler.general && ctx._interactionHandler.general.destroy()
    }
    function disableAutocomplete(ctx) {
        ctx._interactionHandler.autocomplete && ctx._interactionHandler.autocomplete.destroy()
    }
    function disableRTEWidget(ctx) {
        ctx._interactionHandler.rtewidget && ctx._interactionHandler.rtewidget.destroy()
    }
    function disableRTEInline(ctx) {
        ctx._interactionHandler.rteinline && ctx._interactionHandler.rteinline.destroy()
    }
    function disableFileWidget(ctx) {
        ctx._interactionHandler.filewidget && ctx._interactionHandler.filewidget.destroy()
    }
    function disableFile(ctx) {
        channel.off("dragenter", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onEnter).off("dragleave", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onLeave).off("dragover", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onOver).off("drop", DROP_TARGET_COMPONENT_SELECTOR, ctx.file.onDrop)
    }
    function disableDropAreaWidget(ctx) {
        ctx._interactionHandler.dropareawidget && ctx._interactionHandler.dropareawidget.destroy()
    }
    ns.ui.dropController = {
        _interactionHandler: {},
        registry: {},
        register: function(name, controller) {
            this.registry[name] = controller;
            controller.name = name
        },
        deregister: function(name) {
            this.registry[name] = null
        },
        get: function(name) {
            return this.registry[name]
        },
        enable: function(config) {
            if (!config) {
                enableGeneral(this);
                enableFileWidget(this);
                enableDropAreaWidget(this);
                enableFile(this);
                enableRTEWidget(this);
                enableRTEInline(this);
                enableAutocompleteWidget(this)
            } else {
                if (config.general)
                    enableGeneral(this);
                if (config.filewidget)
                    enableFileWidget(this);
                if (config.file)
                    enableFile(this);
                if (config.dropareawidget)
                    enableDropAreaWidget(this);
                if (config.rtewidget)
                    enableRTEWidget(this);
                if (config.rteinline)
                    enableRTEInline(this);
                if (config.autocomplete)
                    enableAutocompleteWidget(this)
            }
        },
        disable: function(config) {
            if (!config) {
                disableGeneral(this);
                disableFileWidget(this);
                disableFile(this);
                disableDropAreaWidget(this);
                disableRTEWidget(this);
                disableRTEInline(this);
                disableAutocomplete(this)
            } else {
                if (config.general)
                    disableGeneral(this);
                if (config.filewidget)
                    disableFileWidget(this);
                if (config.file)
                    disableFile(this);
                if (config.dropareawidget)
                    disableDropAreaWidget(this);
                if (config.rtewidget)
                    disableRTEWidget(this);
                if (config.rteinline)
                    disableRTEInline(this);
                if (config.autocomplete)
                    disableAutocomplete(this)
            }
        },
        activate: function() {
            Granite.author.util.deprecated("Use Granite.author.ui.dropController.enable instead")
        },
        deactivate: function() {
            Granite.author.util.deprecated("Use Granite.author.ui.dropController.disable instead")
        },
        getInsertBehavior: function(element, clientY) {
            var targetHeight = element.clientHeight
              , shouldInsertAfter = false;
            if (targetHeight > INSERT_AFTER_MINHEIGHT) {
                var rect = element.getBoundingClientRect();
                if (rect.top + targetHeight / 2 < clientY)
                    return "after"
            }
            return "before"
        },
        enableDropzone: function(type) {
            if (type === "component")
                $(DROP_TARGET_COMPONENT_SELECTOR).addClass(DROP_TARGET_ENABLED_CSSCLASS);
            else if (type === "asset")
                $(DROP_TARGET_ASSET_SELECTOR).addClass(DROP_TARGET_ENABLED_CSSCLASS)
        },
        disableDropzone: function(type) {
            if (type === "component")
                $(DROP_TARGET_COMPONENT_SELECTOR).removeClass(DROP_TARGET_ENABLED_CSSCLASS);
            else if (type === "asset")
                $(DROP_TARGET_ASSET_SELECTOR).removeClass(DROP_TARGET_ENABLED_CSSCLASS);
            else
                $(DROP_TARGET_SELECTOR).removeClass(DROP_TARGET_ENABLED_CSSCLASS)
        },
        getEventTargetEditable: function(event) {
            return ns.editables.find({
                path: $(event.target).attr("data-path")
            })[0]
        }
    };
    Object.defineProperty(ns, "dropController", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.ui.dropController instead");
            return ns.ui.dropController
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.ui.dropController instead");
            ns.ui.dropController = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DRAG_ORIGIN_CSSCLASS = "cq-dragorigin"
      , DRAG_OVER_CSSCLASS = "cq-dragover"
      , INSERT_BEFORE_CSSCLASS = "cq-Overlay--insertBefore"
      , INSERT_AFTER_CSSCLASS = "cq-Overlay--insertAfter"
      , DRAG_IMAGE_SELECTOR = ".cq-dd-image";
    var dragstate;
    var storage;
    function executeListener(name, event) {
        if (dragstate.currentController && dragstate.currentController[name]) {
            var ev = $.extend(event, dragstate);
            ev.currentTarget = event.target;
            ev.setDragObject = function(st) {
                storage = st
            }
            ;
            ev.getDragObject = function() {
                return storage
            }
            ;
            return dragstate.currentController[name](ev)
        }
        return true
    }
    function deselectDropTargetCandidate(event) {
        var target = event.target;
        var pointer = ns.util.getPageXY(event);
        var element = document.elementFromPoint(pointer.x, pointer.y);
        if (element.classList.contains("cq-Overlay-subdroptarget"))
            element = element.closest(".cq-Overlay");
        if (element && "Editable" === element.dataset.type) {
            var editable = ns.editables.find(element.dataset.path)[0];
            if (editable && editable.overlay) {
                var parent = ns.editables.getParent(editable);
                if (!parent)
                    editable.overlay.setHover(false);
                else {
                    var allowedComponents = ns.components.allowedComponentsFor[parent.path];
                    if (!allowedComponents || allowedComponents.indexOf(target.dataset.path))
                        editable.overlay.setHover(false)
                }
            }
        }
    }
    ns.ui.dropController.general = {
        dragstateContext: document.body,
        onStart: function(event) {
            var target = $(event.target), ghostReference = event.target.querySelectorAll(DRAG_IMAGE_SELECTOR)[0] || target[0], additionalParam;
            try {
                additionalParam = JSON.parse(target.attr("data-param"))
            } catch (ex) {}
            additionalParam = additionalParam || target.attr("data-param") || {};
            dragstate = {
                currentController: ns.ui.dropController.get(target.attr("data-type")),
                origin: target[0],
                path: target.attr("data-path"),
                param: additionalParam
            };
            dragstate.ghost = dragstate.currentController["getDragImage"] ? dragstate.currentController["getDragImage"](dragstate) : ns.util.cloneToIndependentNode(ghostReference);
            dragstate.ghost.style.pointerEvents = "none";
            dragstate.ghost.style.opacity = .8;
            dragstate.ghost.style.webkitTransform = dragstate.ghost.style.transform = "translate(0px, px)";
            document.body.classList.add("u-coral-closedHand");
            this.dragstateContext = document.body;
            this.dragstateContext.appendChild(dragstate.ghost);
            ns.util.positionAt(dragstate.ghost, event.pageX0, event.pageY0);
            target.addClass(DRAG_ORIGIN_CSSCLASS);
            executeListener("handleDragStart", event)
        },
        onContextSwitch: function(event) {
            if (dragstate) {
                this.dragstateContext = event.newContext.body;
                this.dragstateContext.appendChild(dragstate.ghost)
            }
        },
        onMove: function(event) {
            var target = event.target;
            dragstate.ghost.style.webkitTransform = dragstate.ghost.style.transform = "translate(" + event.originX + "px, " + event.originY + "px)";
            deselectDropTargetCandidate(event);
            executeListener("handleDrag", event)
        },
        onEnd: function(event) {
            var target = event.target;
            this.dragstateContext.removeChild(dragstate.ghost);
            executeListener("handleDragEnd", event);
            $(target).removeClass(DRAG_ORIGIN_CSSCLASS);
            document.body.classList.remove("u-coral-closedHand");
            dragstate = null
        },
        onEnter: function(event) {
            var dropzoneElement = event.target
              , $de = $(dropzoneElement);
            var targetEditable = ns.editables.find({
                path: $de.attr("data-path")
            })[0];
            if (targetEditable)
                dragstate.currentDropTarget = {
                    path: targetEditable.path,
                    dom: dropzoneElement,
                    insertBehavior: targetEditable.config.insertBehavior ? targetEditable.config.insertBehavior.split(" ")[1] : null,
                    targetEditable: targetEditable
                };
            if ($de.hasClass(DRAG_ORIGIN_CSSCLASS) || !executeListener("isInsertAllowed", event)) {
                dragstate.currentDropTarget = null;
                return
            }
            $de.addClass(DRAG_OVER_CSSCLASS);
            executeListener("handleDragEnter", event)
        },
        onOver: function(event) {
            if (!dragstate.currentDropTarget)
                return;
            var shouldInsertAfter = ns.ui.dropController.getInsertBehavior(event.target, event.clientY) === "after";
            dragstate.currentDropTarget.insertBehavior = shouldInsertAfter ? ns.persistence.PARAGRAPH_ORDER.after : ns.persistence.PARAGRAPH_ORDER.before;
            $(event.target).toggleClass(INSERT_BEFORE_CSSCLASS, !shouldInsertAfter).toggleClass(INSERT_AFTER_CSSCLASS, shouldInsertAfter);
            executeListener("handleDragOver", event)
        },
        onLeave: function(event) {
            if (!dragstate.currentDropTarget)
                return;
            dragstate.currentDropTarget = null;
            $(event.target).removeClass(DRAG_OVER_CSSCLASS + " " + INSERT_BEFORE_CSSCLASS + " " + INSERT_AFTER_CSSCLASS);
            executeListener("handleDragLeave", event)
        },
        onDrop: function(event) {
            if (!dragstate.currentDropTarget)
                return;
            $(event.target).removeClass(DRAG_OVER_CSSCLASS + " " + INSERT_BEFORE_CSSCLASS + " " + INSERT_AFTER_CSSCLASS);
            executeListener("handleDrop", event)
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DRAG_OVER_CSSCLASS = "cq-dragover";
    var INSERT_BEFORE_CSSCLASS = "cq-Overlay--insertBefore";
    var INSERT_AFTER_CSSCLASS = "cq-Overlay--insertAfter";
    var COMPONENT_PATH = "wcm/foundation/components/image";
    var COMPONENT_FOUNDATION_PATH = "foundation/components/image";
    var COMPONENT_GROUP = "group:General";
    function getAllowedImageComponentPath(event) {
        var targetEditable = ns.ui.dropController.getEventTargetEditable(event);
        if (ns.edit.EditableActions.INSERT.condition(targetEditable, "/libs/" + COMPONENT_PATH, COMPONENT_GROUP))
            return COMPONENT_PATH;
        if (ns.edit.EditableActions.INSERT.condition(targetEditable, "/libs/" + COMPONENT_FOUNDATION_PATH, COMPONENT_GROUP))
            return COMPONENT_FOUNDATION_PATH;
        return undefined
    }
    ns.ui.dropController.file = {
        available: !(typeof window.FileReader === "undefined"),
        onEnter: function(event) {
            if (getAllowedImageComponentPath(event))
                $(event.currentTarget).addClass(DRAG_OVER_CSSCLASS);
            event.preventDefault()
        },
        onLeave: function(event) {
            $(event.currentTarget).removeClass(DRAG_OVER_CSSCLASS + " " + INSERT_BEFORE_CSSCLASS + " " + INSERT_AFTER_CSSCLASS);
            event.preventDefault()
        },
        onOver: function(event) {
            if (getAllowedImageComponentPath(event)) {
                var shouldInsertAfter = ns.ui.dropController.getInsertBehavior(event.currentTarget, event.originalEvent.clientY) === "after";
                $(event.currentTarget).toggleClass(INSERT_BEFORE_CSSCLASS, !shouldInsertAfter).toggleClass(INSERT_AFTER_CSSCLASS, shouldInsertAfter)
            }
            event.preventDefault()
        },
        onDrop: function(event) {
            event.preventDefault();
            var allowedImageComponentPath = getAllowedImageComponentPath(event);
            if (!allowedImageComponentPath)
                return;
            var file = event.originalEvent && event.originalEvent.dataTransfer && event.originalEvent.dataTransfer.files && event.originalEvent.dataTransfer.files[0];
            var shouldInsertAfter = ns.ui.dropController.getInsertBehavior(event.currentTarget, event.originalEvent.clientY) === "after";
            if (file.type.indexOf("image") === -1)
                return;
            var componentPlaceholder = ns.components.find({
                resourceType: allowedImageComponentPath
            })[0];
            var editableNeighbor = ns.ui.dropController.getEventTargetEditable(event);
            ns.edit.EditableActions.INSERT.execute(componentPlaceholder, shouldInsertAfter ? ns.persistence.PARAGRAPH_ORDER.after : ns.persistence.PARAGRAPH_ORDER.before, editableNeighbor).then(function() {
                var editable = ns.editables[ns.editables.length - 1];
                (function(xhr) {
                    if (window.FormData) {
                        xhr.open("POST", Granite.HTTP.externalize(editable.path), true);
                        xhr.send(function(formData) {
                            formData.append(file.name, file);
                            formData.append("_charset_", "utf-8");
                            return formData
                        }(new FormData))
                    } else {
                        xhr.open("PUT", Granite.HTTP.externalize(editable.path + "/" + file.name), true);
                        xhr.send(file)
                    }
                }
                )(new XMLHttpRequest).then(function() {
                    ns.edit.EditableActions.UPDATE.execute(editable, {
                        "file@MoveFrom": editable.path + "/" + file.name
                    });
                    ns.edit.EditableActions.REFRESH.execute(editable)
                }).fail(function() {
                    ns.ui.helpers.notify({
                        content: Granite.I18n.get("File upload operation failed."),
                        type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                    })
                })
            });
            $(event.currentTarget).removeClass(DRAG_OVER_CSSCLASS + " " + INSERT_BEFORE_CSSCLASS + " " + INSERT_AFTER_CSSCLASS)
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var IS_ACTIVE_CLASS = "is-active";
    var IS_DRAG_OVER_CLASS = "is-dragging";
    var WIDGET_SELECTOR = ".cq-FileUpload";
    ns.ui.dropController.inputwidget = {
        onEnter: function(event) {
            $(event.target).addClass(IS_DRAG_OVER_CLASS)
        },
        onLeave: function(event) {
            $(event.target).removeClass(IS_DRAG_OVER_CLASS)
        },
        onOver: function(event) {
            event.preventDefault()
        },
        onDrop: function(event) {
            var dragTarget = $(event.dragTarget), dropTarget = $(event.target), fileUploadElement = dropTarget.closest(WIDGET_SELECTOR), additionalParam;
            try {
                additionalParam = JSON.parse(dragTarget.attr("data-param"))
            } catch (ex) {}
            additionalParam = additionalParam || dragTarget.attr("data-param") || {};
            $(event.target).removeClass(IS_DRAG_OVER_CLASS);
            var assetPath = dragTarget.attr("data-path")
              , assetGroup = dragTarget.attr("data-asset-group")
              , assetMimeType = dragTarget.attr("data-asset-mimetype")
              , assetParam = additionalParam;
            var assetThumbnail = dragTarget.find("img").clone();
            if (fileUploadElement)
                fileUploadElement.trigger($.Event("assetselected", {
                    path: assetPath,
                    group: assetGroup,
                    mimetype: assetMimeType,
                    param: assetParam,
                    thumbnail: assetThumbnail
                }))
        },
        onStart: function(event) {
            channel.find(WIDGET_SELECTOR).each(function() {
                $(this).addClass(IS_ACTIVE_CLASS)
            })
        },
        onEnd: function(event) {
            channel.find(WIDGET_SELECTOR + "." + IS_ACTIVE_CLASS).each(function() {
                $(this).removeClass(IS_ACTIVE_CLASS)
            })
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var IS_ACTIVE_CLASS = "is-active";
    var DRAG_OVER_CSSCLASS = "is-hovered";
    var DROPAREA_SELECTOR = ".js-cq-DropArea";
    var DROPAREA_ASSET_SELECTED_EVENT = "assetSelected";
    ns.ui.dropController.dropareawidget = {
        onEnter: function(event) {
            $(event.target).addClass(DRAG_OVER_CSSCLASS)
        },
        onLeave: function(event) {
            $(event.target).removeClass(DRAG_OVER_CSSCLASS)
        },
        onOver: function(event) {
            event.preventDefault()
        },
        onDrop: function(event) {
            var dragTarget = $(event.dragTarget), dropTarget = $(event.target), dropArea = dropTarget.closest(DROPAREA_SELECTOR), additionalParam;
            try {
                additionalParam = JSON.parse(dragTarget.attr("data-param"))
            } catch (ex) {}
            additionalParam = additionalParam || dragTarget.attr("data-param") || {};
            $(event.target).removeClass(DRAG_OVER_CSSCLASS);
            var assetPath = dragTarget.attr("data-path")
              , assetGroup = dragTarget.attr("data-asset-group")
              , assetMimeType = dragTarget.attr("data-asset-mimetype")
              , assetParam = additionalParam;
            var assetThumbnail = dragTarget.find("img").clone();
            if (dropArea)
                dropArea.trigger($.Event(DROPAREA_ASSET_SELECTED_EVENT, {
                    path: assetPath,
                    group: assetGroup,
                    mimetype: assetMimeType,
                    param: assetParam,
                    thumbnail: assetThumbnail
                }))
        },
        onStart: function(event) {
            channel.find(DROPAREA_SELECTOR).each(function() {
                var $element = $(this);
                if ($element.length > 0)
                    $element.addClass(IS_ACTIVE_CLASS)
            })
        },
        onEnd: function(event) {
            channel.find(DROPAREA_SELECTOR + "." + IS_ACTIVE_CLASS).each(function() {
                var $element = $(this);
                if ($element.length > 0)
                    $element.removeClass(IS_ACTIVE_CLASS)
            })
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DRAG_OVER_CSSCLASS = "is-hovered";
    ns.ui.dropController.rtewidget = {
        onEnter: function(event) {
            $(event.target).addClass(DRAG_OVER_CSSCLASS)
        },
        onLeave: function(event) {
            $(event.target).removeClass(DRAG_OVER_CSSCLASS)
        },
        onOver: function(event) {
            event.preventDefault()
        },
        onDrop: function(event) {
            var dt = event.target;
            var $dragTarget = $(event.dragTarget);
            var path = Granite.HTTP.encodePath($dragTarget.data("path"));
            var mimeType = $dragTarget.data("assetMimetype");
            $(dt).data("rteinstance").notifyDrop({
                path: path,
                mimeType: mimeType
            })
        },
        onStart: function(event) {},
        onEnd: function(event) {}
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DRAG_OVER_CSSCLASS = "is-hovered";
    ns.ui.dropController.rteinline = {
        onEnter: function(event) {},
        onLeave: function(event) {},
        onOver: function(event) {
            event.preventDefault()
        },
        onDrop: function(event) {
            var dt = event.target;
            var $dragTarget = $(event.dragTarget);
            var path = Granite.HTTP.encodePath($dragTarget.data("path"));
            var mimeType = $dragTarget.data("assetMimetype");
            $(dt).data("rteinstance").notifyDrop({
                path: path,
                mimeType: mimeType
            })
        },
        onMove: function(event) {
            ns.ui.dropController.general.onMove(event)
        },
        onStart: function(event) {},
        onEnd: function(event) {
            ns.ui.dropController.general.onEnd(event)
        },
        onContextSwitch: function(event) {
            ns.ui.dropController.general.onContextSwitch(event)
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var IS_ACTIVE_CLASS = "is-active";
    var IS_DRAG_OVER_CLASS = "is-dragging";
    var WIDGET_SELECTOR = ".foundation-autocomplete-droppable";
    ns.ui.dropController.autocomplete = {
        onEnter: function(event) {
            $(event.target).addClass(IS_DRAG_OVER_CLASS)
        },
        onLeave: function(event) {
            $(event.target).removeClass(IS_DRAG_OVER_CLASS)
        },
        onOver: function(event) {
            event.preventDefault()
        },
        onDrop: function(event) {
            var dragTarget = $(event.dragTarget), dropTarget = $(event.target), fileUploadElement = dropTarget.closest(WIDGET_SELECTOR), additionalParam;
            try {
                additionalParam = JSON.parse(dragTarget.attr("data-param"))
            } catch (ex) {}
            additionalParam = additionalParam || dragTarget.attr("data-param") || {};
            $(event.target).removeClass(IS_DRAG_OVER_CLASS);
            var assetPath = dragTarget.attr("data-path")
              , assetGroup = dragTarget.attr("data-asset-group")
              , assetMimeType = dragTarget.attr("data-asset-mimetype")
              , assetParam = additionalParam;
            var assetThumbnail = dragTarget.find("img").clone();
            if (fileUploadElement)
                fileUploadElement.trigger($.Event("foundation-assetdropped", {
                    path: assetPath,
                    group: assetGroup,
                    mimetype: assetMimeType,
                    param: assetParam,
                    thumbnail: assetThumbnail
                }))
        },
        onStart: function(event) {
            channel.find(WIDGET_SELECTOR).each(function() {
                $(this).addClass(IS_ACTIVE_CLASS)
            })
        },
        onEnd: function(event) {
            channel.find(WIDGET_SELECTOR + "." + IS_ACTIVE_CLASS).each(function() {
                $(this).removeClass(IS_ACTIVE_CLASS)
            })
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var ui = $(window).adaptTo("foundation-ui");
    $(window).adaptTo("foundation-registry").register("foundation.ui.notify.positionhandler", function(el) {
        $("#Content").append(el)
    });
    ns.ui.helpers = function() {
        var self = {};
        self.PROMPT_TYPES = {
            DEFAULT: "default",
            ERROR: "error",
            NOTICE: "warning",
            SUCCESS: "success",
            HELP: "help",
            INFO: "info",
            WARNING: "warning"
        };
        self.NOTIFICATION_TYPES = {
            ERROR: "error",
            NOTICE: "warning",
            SUCCESS: "success",
            HELP: "help",
            INFO: "info",
            WARNING: "warning"
        };
        self.prompt = function(config) {
            var title = config.title || "";
            var message = config.message || "";
            var type = config.type || "default";
            ui.prompt(title, message, type, config.actions, config.callback)
        }
        ;
        self.notify = function(config) {
            var type = config.type || ns.ui.helpers.NOTIFICATION_TYPES.ERROR;
            ui.notify(config.heading, config.content, type)
        }
        ;
        self.wait = function(element) {
            ui.wait(element)
        }
        ;
        self.clearWait = function() {
            ui.clearWait()
        }
        ;
        $(window).on("loading-show", function(event) {
            Granite.author.util.deprecated("Use Granite.author.ui.helpers.wait instead");
            self.wait()
        });
        $(window).on("loading-hide", function(event) {
            Granite.author.util.deprecated("Use Granite.author.ui.helpers.clearWait instead");
            self.clearWait()
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.persistence = {};
    ns.persistence.PARAGRAPH_ORDER = {
        after: "after",
        before: "before",
        last: "last"
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.persistence.Request = function(config) {
        this.params = {};
        this.url = undefined;
        if (!config)
            return;
        this.type = config.type;
        this.async = config.async;
        this.dataType = config.dataType
    }
    ;
    ns.persistence.Request.prototype.setURL = function(url) {
        this.url = url;
        return this
    }
    ;
    ns.persistence.Request.prototype.setDataType = function(dataType) {
        this.dataType = dataType;
        return this
    }
    ;
    ns.persistence.Request.prototype.setParam = function(name, value) {
        this.params[name] = value;
        return this
    }
    ;
    ns.persistence.Request.prototype.setParams = function(params) {
        if (!params)
            return this;
        var i;
        for (i in params)
            if (params.hasOwnProperty(i))
                this.setParam(i, params[i]);
        return this
    }
    ;
    ns.persistence.Request.prototype.send = function() {
        return $.ajax({
            type: this.type,
            dataType: this.dataType && this.dataType.toLowerCase() || "html",
            url: this.url,
            data: this.params,
            async: this.async
        })
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel) {
    var SLING_MODEL_SELECTOR = "model";
    var SLING_MODEL_REGEX = new RegExp("." + SLING_MODEL_SELECTOR + ".json/g");
    var DATA_TYPE_JSON = "json";
    var contentDataType;
    function expectDataType(config, expectedDataType) {
        var dataType = config && config.dataType;
        return dataType && expectedDataType === dataType.toLowerCase() || !dataType && expectedDataType === contentDataType
    }
    ns.persistence.GetRequest = function(config) {
        var innerConfig = $.extend({
            dataType: contentDataType
        }, config);
        ns.persistence.Request.call(this, innerConfig);
        this.type = "GET"
    }
    ;
    ns.util.inherits(ns.persistence.GetRequest, ns.persistence.Request);
    ns.persistence.GetRequest.prototype.prepareReadParagraph = function(config) {
        var url = config.path;
        var params = config.params || {};
        var dataType = config.dataType || this.dataType || contentDataType;
        if (expectDataType(config, DATA_TYPE_JSON) && !url.match(SLING_MODEL_REGEX))
            url = url.replace(/\.html|\.json/, "") + "." + SLING_MODEL_SELECTOR + ".json";
        else if (!url.match(/\.html/g))
            url += ".html";
        if (url.match(/\.html/))
            params.forceeditcontext = true;
        return this.setURL(url).setParams(params).setDataType(dataType)
    }
    ;
    ns.persistence.GetRequest.prototype.prepareReadParagraphContent = function(config) {
        var url = config.path;
        url = url.replace(".html", ".json");
        if (!url.match(/\.json/g))
            url += ".json";
        if (expectDataType(config, DATA_TYPE_JSON) && !url.match(SLING_MODEL_REGEX))
            url = url.replace(/\.([A-z]|[\d])+\.json/, "." + SLING_MODEL_SELECTOR + ".json");
        else if ((url.match(/(\.(.+))+\.json/g) || []).length > 0 && !url.match(/\.([\d]+|infinity)\.json/g))
            url = url.replace(".json", ".0.json");
        return this.setURL(url)
    }
    ;
    channel.on("cq-contentframe-datatype-set", function(data) {
        contentDataType = data && data.dataType && data.dataType.toLowerCase()
    })
}
)(jQuery, Granite.author, jQuery(document));
(function($, ns, channel, window, undefined) {
    ns.persistence.PostRequest = function() {
        ns.persistence.Request.call(this, arguments);
        this.type = "POST"
    }
    ;
    ns.util.inherits(ns.persistence.PostRequest, ns.persistence.Request);
    var getOrder = function(config) {
        return config.neighborName && config.neighborName !== "*" ? config.relativePosition + " " + config.neighborName : ns.persistence.PARAGRAPH_ORDER.last
    };
    ns.persistence.PostRequest.prototype.prepareCreateParagraph = function(config) {
        var nameHint = config.nameHint ? config.nameHint : config.resourceType.substring(config.resourceType.lastIndexOf("/") + 1);
        if (config.templatePath)
            this.setParam("./@CopyFrom", config.templatePath);
        return this.setURL(config.parentPath + "/").setParam("_charset_", "utf-8").setParams(config.configParams).setParams(config.extraParams).setParam("./jcr:created", "").setParam("./jcr:createdBy", "").setParam("./jcr:lastModified", "").setParam("./jcr:lastModifiedBy", "").setParam("./sling:resourceType", config.resourceType).setParam("parentResourceType", config.parentResourceType).setParam(":order", getOrder(config)).setParam(":nameHint", nameHint)
    }
    ;
    ns.persistence.PostRequest.prototype.prepareDeleteParagraph = function(config) {
        return this.setURL(config.path).setParam(":operation", "delete")
    }
    ;
    ns.persistence.PostRequest.prototype.prepareCopyParagraph = function(config) {
        var nameHint = config.path.substring(config.path.lastIndexOf("/") + 1) + " copy";
        return this.setURL(config.parentPath + "/").setParam("./@CopyFrom", config.path).setParam("./sling:resourceType", config.resourceType).setParam("parentResourceType", config.parentResourceType).setParam(":order", getOrder(config)).setParam(":nameHint", nameHint)
    }
    ;
    ns.persistence.PostRequest.prototype.prepareMoveParagraph = function(config) {
        var moveToAnotherParent = config.parentPath !== config.path.substr(0, config.path.lastIndexOf("/"));
        if (moveToAnotherParent)
            return this._prepareMoveParagraphToAnotherParent(config);
        else
            return this._prepareOrderParagraph(config)
    }
    ;
    ns.persistence.PostRequest.prototype._prepareMoveParagraphToAnotherParent = function(config) {
        var nameHint = config.path.substring(config.path.lastIndexOf("/") + 1);
        return this.setURL(config.parentPath + "/").setParam("./@MoveFrom", config.path).setParam("./sling:resourceType", config.resourceType).setParam("parentResourceType", config.parentResourceType).setParam(":order", getOrder(config)).setParam(":nameHint", nameHint)
    }
    ;
    ns.persistence.PostRequest.prototype._prepareOrderParagraph = function(config) {
        return this.setURL(config.path).setParam(":order", getOrder(config))
    }
    ;
    ns.persistence.PostRequest.prototype.prepareUpdateParagraph = function(config) {
        return this.setURL(config.path).setParam("_charset_", "utf-8").setParam("./jcr:lastModified", "").setParam("./jcr:lastModifiedBy", "").setParam("./sling:resourceType", config.resourceType).setParams(config.properties)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = ns.persistence;
    self.createParagraph = function(component, relativePosition, editableNeighbor, additionalData) {
        var args = arguments;
        channel.trigger("cq-persistence-before-create", args);
        return sendCreateParagraph({
            resourceType: component.getResourceType(),
            parentPath: editableNeighbor.getParentPath(),
            parentResourceType: editableNeighbor.getParentResourceType(),
            relativePosition: relativePosition,
            neighborName: editableNeighbor.getNodeName(),
            configParams: component.getConfigParams(),
            extraParams: component.getExtraParams(),
            templatePath: component.getTemplatePath()
        }, additionalData).then(function(data) {
            channel.trigger("cq-persistence-after-create", args);
            return data
        }).fail(function(jqXHR, textStatus, error) {
            var customResponse = jqXHR.responseText.match(/<title>(.*?)<\/title>/)[1];
            var errorMessage = customResponse.substr(customResponse.indexOf(" ")).trim();
            if (errorMessage)
                ns.ui.helpers.notify({
                    content: Granite.I18n.get(errorMessage),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                });
            else
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("Paragraph create operation failed."),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                })
        })
    }
    ;
    self.moveParagraph = function(editable, relativePosition, editableNeighbor) {
        var args = arguments;
        channel.trigger("cq-persistence-before-move", args);
        return sendMoveParagraph({
            path: editable.path,
            parentPath: editableNeighbor.getParentPath(),
            parentResourceType: editableNeighbor.getParentResourceType(),
            relativePosition: relativePosition,
            neighborName: editableNeighbor.getNodeName(),
            resourceType: editable.type
        }).then(function(data) {
            sendReadParagraph({
                path: $(data).find("#Path").text()
            }).then(function() {
                channel.trigger("cq-persistence-after-move", args)
            });
            return data
        }).fail(function(jqXHR, textStatus, error) {
            var customResponse = jqXHR.responseText.match(/<title>(.*?)<\/title>/)[1];
            var errorMessage = customResponse.substr(customResponse.indexOf(" ")).trim();
            if (errorMessage)
                ns.ui.helpers.notify({
                    content: Granite.I18n.get(errorMessage),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                });
            else
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("Paragraph move operation failed."),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                })
        })
    }
    ;
    self.copyParagraph = function(editable, relativePosition, editableNeighbor) {
        var args = arguments;
        channel.trigger("cq-persistence-before-copy", args);
        return sendCopyParagraph({
            path: editable.path,
            resourceType: editable.type,
            parentPath: editableNeighbor.getParentPath(),
            parentResourceType: editableNeighbor.getParentResourceType(),
            relativePosition: relativePosition,
            neighborName: editableNeighbor.getNodeName()
        }).then(function(data) {
            sendReadParagraph({
                path: $(data).find("#Path").text()
            }).then(function() {
                channel.trigger("cq-persistence-after-copy", args)
            });
            return data
        }).fail(function(jqXHR, textStatus, error) {
            var customResponse = jqXHR.responseText.match(/<title>(.*?)<\/title>/)[1];
            var errorMessage = customResponse.substr(customResponse.indexOf(" ")).trim();
            if (errorMessage)
                ns.ui.helpers.notify({
                    content: Granite.I18n.get(errorMessage),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                });
            else
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("Paragraph copy operation failed."),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                })
        })
    }
    ;
    self.updateParagraph = function(editable, properties) {
        var args = arguments;
        channel.trigger("cq-persistence-before-update", args);
        return sendUpdateParagraph({
            path: editable.path,
            properties: properties,
            resourceType: editable.type
        }).then(function(data) {
            channel.trigger("cq-persistence-after-update", args);
            return data
        })
    }
    ;
    self.updateParagraphProperty = function(editable, property, content) {
        var properties = {};
        properties[property] = content;
        return self.updateParagraph(editable, properties)
    }
    ;
    self.deleteParagraph = function(editable) {
        var args = arguments;
        channel.trigger("cq-persistence-before-delete", args);
        return sendDeleteParagraph({
            path: editable.path
        }).then(function(data) {
            channel.trigger("cq-persistence-after-delete", args);
            return data
        }).fail(function(jqXHR, textStatus, error) {
            var customResponse = jqXHR.responseText.match(/<title>(.*?)<\/title>/)[1];
            var errorMessage = customResponse.substr(customResponse.indexOf(" ")).trim();
            if (errorMessage)
                ns.ui.helpers.notify({
                    content: Granite.I18n.get(errorMessage),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                });
            else
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("Paragraph delete operation failed."),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                })
        })
    }
    ;
    self.readParagraph = function(editable, config) {
        var config = config || {};
        config.path = editable.slingPath ? editable.slingPath : editable.path;
        return sendReadParagraph(config)
    }
    ;
    self.readParagraphContent = function(editable, async, xssConfig, dataType) {
        var path = editable.slingPath ? editable.slingPath : editable.path;
        if (xssConfig && xssConfig.disableXSSFiltering) {
            var urlParts = path.split("/"), partIndex, lastPart = "", selectorInsertIndex = 0;
            var selector = ".disableXSSFiltering";
            for (partIndex = urlParts.length - 1; partIndex >= 0; partIndex--)
                if (urlParts[partIndex] != "") {
                    lastPart = urlParts[partIndex];
                    break
                }
            selectorInsertIndex = lastPart.indexOf(".");
            if (selectorInsertIndex == -1)
                selectorInsertIndex = lastPart.length;
            lastPart = lastPart.substring(0, selectorInsertIndex) + selector + lastPart.substring(selectorInsertIndex, lastPart.length);
            urlParts[partIndex] = lastPart;
            path = urlParts.join("/")
        }
        if (async == undefined)
            async = true;
        return sendReadParagraphContent({
            path: path,
            dataType: dataType
        }, async)
    }
    ;
    var sendCreateParagraph = function(config, additionalData) {
        return (new ns.persistence.PostRequest).prepareCreateParagraph(config).setParams(additionalData).send()
    };
    var sendDeleteParagraph = function(config) {
        return (new ns.persistence.PostRequest).prepareDeleteParagraph(config).send()
    };
    var sendCopyParagraph = function(config) {
        return (new ns.persistence.PostRequest).prepareCopyParagraph(config).send()
    };
    var sendMoveParagraph = function(config) {
        return (new ns.persistence.PostRequest).prepareMoveParagraph(config).send()
    };
    var sendUpdateParagraph = function(config) {
        return (new ns.persistence.PostRequest).prepareUpdateParagraph(config).send()
    };
    var sendUpdateParagraphProperty = function(config) {
        return this.updateParagraph(config)
    };
    var sendReadParagraph = function(config) {
        return (new ns.persistence.GetRequest).prepareReadParagraph(config).send()
    };
    var sendReadParagraphContent = function(config, async) {
        return (new ns.persistence.GetRequest({
            async: async,
            dataType: config.dataType
        })).prepareReadParagraphContent(config).send()
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history = {};
    ns.history.util = {};
    ns.history.actions = {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.Blob = function(config) {
        var self = this;
        self.op = null;
        self.path = null;
        self.field = null;
        self.id = null;
        self.isDirty = false;
        self.deleted = false;
        self.unchanged = false;
        self.init = function(cfg) {
            cfg = cfg || {};
            $.extend(true, self, cfg)
        }
        ;
        self.save = function(servletUrl, parPath, originalBlobId) {
            if (self.op == "update")
                ns.history.util.Utils.saveBinary(servletUrl, parPath, this.path, originalBlobId).then(function(result) {
                    self.id = result.id;
                    self.deleted = result.deleted;
                    self.unchanged = result.unchanged;
                    self.isDirty = result == null
                });
            else {
                self.id = null;
                self.isDirty = false;
                self.deleted = true
            }
        }
        ;
        self.saveCloned = function(servletUrl, parPath) {
            var clone = new ns.history.Blob({
                "op": self.op,
                "field": self.field,
                "path": self.path
            });
            clone.save(servletUrl, parPath, self.id);
            return clone
        }
        ;
        self.restore = function(servletUrl, parPath, isGlobal) {
            if (!self.isDirty && !self.unchanged)
                if (self.deleted)
                    return ns.history.util.Utils.restoreBinary(servletUrl, null, parPath, self.path, isGlobal).promise();
                else
                    return ns.history.util.Utils.restoreBinary(servletUrl, self.id, parPath, self.path, isGlobal).promise();
            else
                return $.Deferred().reject().promise()
        }
        ;
        self.serialize = function() {
            return {
                "op": self.op,
                "path": self.path,
                "field": self.field,
                "id": self.id,
                "isDirty": self.isDirty,
                "deleted": self.deleted,
                "unchanged": self.unchanged
            }
        }
        ;
        self.init(config)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.util.Utils = function() {
        return {
            beginStep: function() {
                var historyEnabled = ns.history.Manager.isEnabled(), history, historyStep;
                if (historyEnabled) {
                    history = ns.history.Manager.getHistory();
                    historyStep = new ns.history.Step(history.createStepConfig());
                    history.addStep(historyStep)
                }
                return historyStep
            },
            finalizeStep: function(historyStep) {
                var historyEnabled = ns.history.Manager.isEnabled();
                if (historyEnabled && historyStep && historyStep.actions.length > 0) {
                    ns.history.util.Utils.sortDeleteParagraphActions(historyStep);
                    ns.history.util.Utils.sortMoveParagraphActions(historyStep);
                    ns.history.util.Utils.sortInsertParagraphActions(historyStep);
                    historyStep.commit()
                }
                return historyStep
            },
            addUpdateParagraphStep: function(path, type, originalData, changedData) {
                var historyStep, historyAction;
                if (ns.history.Manager.isEnabled() && path && type) {
                    historyStep = ns.history.util.Utils.beginStep();
                    historyAction = new ns.history.actions.UpdateParagraph(path,type,originalData,changedData);
                    historyStep.addAction(historyAction);
                    historyStep.commit()
                }
            },
            jsonToSlingParameters: function(json, prefix, parameters, isRecursiveCall) {
                parameters = parameters || {};
                prefix = prefix || "./";
                if ($.isPlainObject(json))
                    for (var key in json) {
                        if (json.hasOwnProperty(key))
                            if (key == "jcr:primaryType") {
                                var typeHint = (ns.history.util.Utils.strEndsWith(prefix, "/") ? prefix.substring(0, prefix - 1) : prefix) + "@TypeHint";
                                parameters[typeHint] = json[key]
                            } else {
                                var newPrefix = prefix + (ns.history.util.Utils.strEndsWith(prefix, "/") ? "" : "/") + key;
                                ns.history.util.Utils.jsonToSlingParameters(json[key], newPrefix, parameters, true)
                            }
                    }
                else if (isRecursiveCall || !ns.history.util.Utils.strEndsWith(prefix, "sling:resourceType")) {
                    parameters[prefix] = json;
                    ns.history.util.Utils.createTypeHint(parameters, prefix)
                }
                return parameters
            },
            getCurrentData: function(editable, basicDataOnly) {
                var parentPath = editable.getParentPath(), pathSepIndex = editable.path.lastIndexOf("/"), itemName = pathSepIndex >= 0 ? editable.path.substring(pathSepIndex + 1) : editable.path, takeNext, insertPath = null, historyData, blobs = null;
                return ns.persistence.readParagraphContent({
                    path: parentPath + ".infinity"
                }, undefined, {}, "html").then(function(data) {
                    var dataObj = $.parseJSON(data), data;
                    for (var key in dataObj)
                        if (dataObj.hasOwnProperty(key))
                            if (key === itemName)
                                takeNext = true;
                            else if (takeNext) {
                                insertPath = parentPath + "/" + key;
                                break
                            }
                    data = dataObj[itemName];
                    if (basicDataOnly !== true) {
                        blobs = [];
                        ns.history.util.Utils.determineBlobs(data, blobs);
                        var blobCnt = blobs.length;
                        for (var b = 0; b < blobCnt; b++) {
                            var blob = blobs[b];
                            var fieldNames = blob.field.split("/");
                            var hrchCnt = fieldNames.length - 1;
                            var fieldData = data;
                            for (var h = 0; h < hrchCnt; h++)
                                fieldData = fieldData[fieldNames[h]];
                            delete fieldData[fieldNames[hrchCnt]]
                        }
                    }
                    ns.history.util.Utils.filterJSON(data);
                    return {
                        "data": data,
                        "insertBefore": insertPath,
                        "blobs": blobs
                    }
                })
            },
            getNeighborPath: function(editable, relativePos) {
                var parentPath = editable.getParentPath(), pathSepIndex = editable.path.lastIndexOf("/"), itemName = pathSepIndex >= 0 ? editable.path.substring(pathSepIndex + 1) : editable.path, neighborPath;
                return ns.persistence.readParagraphContent({
                    path: parentPath + ".infinity"
                }, true, null, "html").then(function(data) {
                    var dataObj = $.parseJSON(data), data, takeNext = false;
                    if (relativePos == "after")
                        for (var key in dataObj) {
                            if (dataObj.hasOwnProperty(key))
                                if (key == itemName)
                                    break;
                                else
                                    neighborPath = parentPath + "/" + key
                        }
                    else
                        for (var key in dataObj)
                            if (dataObj.hasOwnProperty(key))
                                if (key == itemName)
                                    takeNext = true;
                                else if (takeNext) {
                                    neighborPath = parentPath + "/" + key;
                                    break
                                }
                    if (!neighborPath)
                        neighborPath = parentPath + "/*";
                    data = {
                        "neighborPath": neighborPath
                    };
                    return data
                })
            },
            filterJSON: function(json, createTypeHint) {
                if ($.isPlainObject(json))
                    for (var key in json) {
                        if (json.hasOwnProperty(key))
                            if (ns.history.util.Utils.isFiltered(key)) {
                                if (key !== "jcr:primaryType" || !createTypeHint)
                                    delete json[key]
                            } else if (key !== "cq:annotations") {
                                var replacement = ns.history.util.Utils.filterJSON(json[key], createTypeHint);
                                if (replacement != null)
                                    json[key] = replacement
                            }
                    }
                else if ($.isArray(json)) {
                    var itemCnt = json.length;
                    for (var i = 0; i < itemCnt; i++)
                        ns.history.util.Utils.filterJSON(json[i], createTypeHint)
                }
                return null
            },
            isFiltered: function(name) {
                var lastSepPos = name.lastIndexOf("/");
                if (lastSepPos >= 0)
                    name = name.substring(lastSepPos + 1);
                switch (name) {
                case "jcr:primaryType":
                case "jcr:lastModified":
                case "jcr:lastModifiedBy":
                case "jcr:created":
                case "jcr:createdBy":
                case ":jcr:data":
                case "jcr:uuid":
                    return true
                }
                return ns.history.util.Utils.strEndsWith(name, ["@Delete", "@MoveFrom"])
            },
            createTypeHint: function(data, name) {
                var value = data[name]
                  , typeHint = ns.history.util.Utils.getTypeForHint(value);
                if (typeHint) {
                    data[name] = String(data[name]);
                    data[name + "@TypeHint"] = typeHint
                }
            },
            getTypeForHint: function(value) {
                var typeHint = null;
                if (typeof value === "number")
                    if (parseInt(value) == parseFloat(value))
                        typeHint = "Long";
                    else
                        typeHint = "Double";
                else if ($.type(value) === "boolean")
                    typeHint = "Boolean";
                else if (isNaN(value) && !isNaN(Date.parse(value)))
                    typeHint = "Date";
                else if (typeof value === "string")
                    typeHint = "String";
                return typeHint
            },
            determineBlobs: function(data, blobs, path, currentField) {
                if (path == null)
                    path = "";
                if (data) {
                    var isComponent = false;
                    if (data["sling:resourceType"])
                        isComponent = true;
                    else if (data["jcr:primaryType"] == "nt:resource")
                        blobs.push(new ns.history.Blob({
                            "op": "update",
                            "path": currentField,
                            "field": currentField
                        }));
                    for (var key in data)
                        if (data.hasOwnProperty(key)) {
                            var child = data[key];
                            if ($.isPlainObject(child)) {
                                if (isComponent)
                                    currentField = path + key;
                                ns.history.util.Utils.determineBlobs(child, blobs, path + key + "/", currentField)
                            }
                        }
                }
            },
            serializeBlobs: function(blobs) {
                var blobCnt, serializedBlobs = [];
                if (blobs) {
                    blobCnt = blobs.length;
                    for (var b = 0; b < blobCnt; b++)
                        serializedBlobs.push(blobs[b].serialize())
                }
                return serializedBlobs
            },
            createBlobsFromSerialized: function(serializedBlobs) {
                var blobCnt, blobs = [];
                if (serializedBlobs) {
                    blobCnt = serializedBlobs.length;
                    for (var b = 0; b < blobCnt; b++)
                        blobs.push(new ns.history.Blob(serializedBlobs[b]))
                }
                return blobs
            },
            saveBinary: function(url, parPath, subPath, originalBlobId) {
                var result = null
                  , params = {
                    "operation": "save",
                    "par": parPath,
                    "srcPath": subPath
                };
                if (originalBlobId)
                    params["originalBlob"] = originalBlobId;
                return $.ajax({
                    type: "POST",
                    url: url,
                    data: params,
                    dataType: "html"
                }).then(function(data) {
                    var id = $(data).find("#Path").text(), isUnchanged;
                    if (id != null && id.length === 0)
                        id = null;
                    isUnchanged = id === originalBlobId;
                    result = {
                        "id": isUnchanged ? null : id,
                        "deleted": id == null,
                        "unchanged": isUnchanged
                    };
                    return result
                })
            },
            restoreBinary: function(url, undoDataPath, parPath, subPath, isGlobal) {
                var params = {
                    "operation": "restore",
                    "srcPath": undoDataPath != null ? undoDataPath : "",
                    "par": parPath,
                    "targetPath": subPath,
                    "global": isGlobal === true ? "true" : "false"
                };
                return $.ajax({
                    type: "POST",
                    url: url,
                    data: params,
                    dataType: "html"
                })
            },
            strStartsWith: function(str, partialStr) {
                if ($.isArray(partialStr)) {
                    var strCnt = partialStr.length;
                    for (var s = 0; s < strCnt; s++)
                        if (ns.history.util.Utils.strStartsWith(str, partialStr[s]))
                            return true;
                    return false
                }
                var pLen = partialStr.length;
                if (str.length >= pLen)
                    return str.substring(0, pLen) == partialStr;
                return false
            },
            strEndsWith: function(str, partialStr) {
                if ($.isArray(partialStr)) {
                    var strCnt = partialStr.length;
                    for (var s = 0; s < strCnt; s++)
                        if (ns.history.util.Utils.strEndsWith(str, partialStr[s]))
                            return true;
                    return false
                }
                var sLen = str.length;
                var pLen = partialStr.length;
                if (sLen >= pLen)
                    return str.substring(sLen - pLen, sLen) == partialStr;
                return false
            },
            determineInsertPath: function(editable) {
                var insertPath, resolveData = {};
                return ns.history.util.Utils.getCurrentData(editable).then(function(data) {
                    insertPath = data.insertBefore;
                    if (!insertPath)
                        insertPath = editable.getParentPath() + "/*";
                    resolveData.insertPath = insertPath;
                    return resolveData
                })
            },
            sortMoveParagraphActions: function(step) {
                var actions = step.actions;
                var reverse = false;
                for (var a = actions.length - 1; a >= 0; a--) {
                    var actionToCheck = actions[a];
                    if (actionToCheck instanceof Granite.author.history.actions.MoveParagraph) {
                        reverse = true;
                        break
                    }
                }
                if (reverse === true)
                    actions.reverse()
            },
            sortInsertParagraphActions: function(step) {
                var actions = step.actions;
                if (actions.some(function(action) {
                    return action instanceof Granite.author.history.actions.InsertParagraph
                }))
                    actions.reverse()
            },
            sortDeleteParagraphActions: function(step) {
                var actions = step.actions;
                var removes = [];
                for (var a = actions.length - 1; a >= 0; a--) {
                    var actionToCheck = actions[a];
                    if (actionToCheck instanceof Granite.author.history.actions.DeleteParagraph) {
                        removes.push(actionToCheck);
                        actions.splice(a, 1)
                    }
                }
                var sortedRemoves = [];
                var hasSafePredecessor = function(actionToCheck) {
                    var predPath = actionToCheck.insertPath;
                    for (var r = 0; r < removes.length; r++)
                        if (removes[r].path == predPath)
                            return false;
                    return true
                };
                while (removes.length > 0) {
                    var removeCnt = removes.length;
                    var changes = 0;
                    for (var r = removeCnt - 1; r >= 0; r--) {
                        var removalToCheck = removes[r];
                        if (hasSafePredecessor(removalToCheck)) {
                            sortedRemoves.push(removalToCheck);
                            removes.splice(r, 1);
                            changes++
                        }
                    }
                    if (changes === 0)
                        throw new Error("Could not sort Delete Paragraph Actions.");
                }
                step.actions = actions.concat(sortedRemoves)
            }
        }
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.persistence = {};
    ns.history.persistence.STORE = "pages";
    ns.history.persistence.Mode = function() {
        return {
            ON_UNLOAD: "unload",
            ON_STEP: "step"
        }
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var hiddenCssClass = "hide";
    ns.history.History = function(config) {
        var self = {};
        self.history = [];
        self.activeStep = -1;
        self.stepInProcess = null;
        self.operationType = null;
        self.blockedPaths = [];
        self.persistence = null;
        self.pageVersion = null;
        self.blocked = false;
        self.edited = false;
        self.operationActive = false;
        self._init = function(cfg) {
            cfg = cfg || {};
            self.config = $.extend(true, {}, ns.history.History.defaults, cfg);
            self.persistence = ns.clientsidePersistence.createStore(self.config.persistenceConfig);
            self.addListeners()
        }
        ;
        self.canUndo = function() {
            return !self.operationActive && !self.blocked && self.activeStep >= 0
        }
        ;
        self.canRedo = function() {
            return !self.operationActive && !self.blocked && self.activeStep < self.history.length - 1
        }
        ;
        self.undo = function() {
            var stepValidity;
            if (!self.canUndo())
                throw new Error(Granite.I18n.get("Unable to undo."));
            if (!self.isActivePointerValid())
                throw new Error("The undo position is invalid. Position: " + self.activeStep + "; max: " + self.history.length);
            self.stepInProcess = self.history[self.activeStep];
            stepValidity = self.stepInProcess.getValidity(self);
            if (stepValidity !== ns.history.Step.VALID) {
                self.handleInvalidStep(stepValidity, false);
                if (stepValidity != ns.history.Step.NOT_WHITELISTED)
                    return
            }
            self.activeStep--;
            self.setEdited(true);
            if (self.config.persistenceMode == ns.history.persistence.Mode.ON_STEP)
                self.save(ns.history.Manager.getPagePath());
            self.operationType = ns.history.History.OPERATION_UNDO;
            self.setOperationActive(true);
            self.stepInProcess.undo()
        }
        ;
        self.redo = function() {
            var stepValidity;
            if (!self.canRedo())
                throw new Error(Granite.I18n.get("Unable to redo."));
            self.activeStep++;
            if (!self.isActivePointerValid())
                throw new Error("The redo position is invalid. Position: " + (self.activeStep - 1) + "; max: " + self.history.length);
            self.stepInProcess = self.history[self.activeStep];
            stepValidity = self.stepInProcess.getValidity(self);
            if (stepValidity !== ns.history.Step.VALID) {
                self.handleInvalidStep(stepValidity, true);
                if (stepValidity !== ns.history.Step.NOT_WHITELISTED) {
                    self.activeStep--;
                    return
                }
            }
            self.setEdited(true);
            if (self.config.persistenceMode == ns.history.persistence.Mode.ON_STEP)
                self.save(ns.history.Manager.getPagePath());
            self.setOperationActive(true);
            self.operationType = ns.history.History.OPERATION_REDO;
            self.stepInProcess.redo()
        }
        ;
        self.addStep = function(step) {
            self.clearRedo();
            self.history.push(step);
            self.activeStep++;
            return true
        }
        ;
        self.removeStep = function(step) {
            var itemsRemoved = [];
            $.each(self.history, function(i, s) {
                if (step == s) {
                    itemsRemoved = self.history.splice(i, 1);
                    self.activeStep = i - 1
                }
            });
            return itemsRemoved.length === 0
        }
        ;
        self.clear = function() {
            self.history = [];
            self.activeStep = -1;
            self.blockedPaths = [];
            channel.off("cq-history-paragraph-id-changed");
            self.updateUIControls()
        }
        ;
        self.clearRedo = function() {
            var clearStart = self.activeStep + 1
              , numStepsToRemove = self.history.length - clearStart
              , removedSteps = [];
            if (self.canRedo())
                removedSteps = self.history.splice(clearStart, numStepsToRemove);
            return removedSteps
        }
        ;
        self.onStepCommitted = function(event, step) {
            self.pruneHistory();
            self.setEdited(true);
            self.updateUIControls();
            if (self.config.persistenceMode == ns.history.persistence.Mode.ON_STEP)
                self.save(ns.history.Manager.getPagePath())
        }
        ;
        self.onStepCompleted = function(event, step) {
            var historyEvent = "cq-history-step-" + self.operationType + "-complete";
            if (self.config.persistenceMode == ns.history.persistence.Mode.ON_STEP)
                self.save(ns.history.Manager.getPagePath());
            channel.trigger(historyEvent, step);
            self.restoreScreen(step, self.operationType === "undo");
            self.setOperationActive(false);
            self.updateUIControls()
        }
        ;
        self.onStepFailed = function(event, step) {
            var isUndo = self.operationType === ns.history.History.OPERATION_UNDO, title = isUndo ? Granite.I18n.get("Undo failed") : Granite.I18n.get("Redo failed"), message;
            self.setOperationActive(false);
            message = isUndo ? Granite.I18n.get("The undo operation failed. ") : Granite.I18n.get("The redo operation failed. ");
            message += Granite.I18n.get("The reason may be a concurrent page edit, redone cross-page move, or network issue.");
            message += "\x3cbr\x3e\x3cbr\x3e";
            message += Granite.I18n.get("You can either:");
            message += "\x3cul\x3e\x3cli\x3e";
            message += Granite.I18n.get("\x3cb\x3eClear History\x3c/b\x3e - Clears the undo history and you won't be able to undo or redo recorded actions.");
            message += "\x3c/li\x3e\x3cli\x3e";
            message += Granite.I18n.get("\x3cb\x3eCancel\x3c/b\x3e - Returns you to where you were and you can still redo previously undone actions.");
            message += "\x3c/li\x3e\x3c/ul\x3e";
            ns.ui.helpers.prompt({
                title: title,
                message: message,
                actions: [{
                    id: "CANCEL",
                    text: Granite.I18n.get("Cancel", "Label for Cancel button")
                }, {
                    id: "CLEAR_HISTORY",
                    primary: true,
                    text: Granite.I18n.get("Clear History", "Label for Clear History button")
                }],
                callback: function(actionId) {
                    if (actionId === "CANCEL")
                        if (isUndo)
                            self.activeStep++;
                        else
                            self.activeStep--;
                    else if (actionId === "CLEAR_HISTORY") {
                        self.clear();
                        self.save(ns.history.Manager.getPagePath())
                    } else
                        self.updateUIControls()
                }
            })
        }
        ;
        self.addListeners = function() {
            channel.on("cq-history-step-committed", self.onStepCommitted);
            channel.on("cq-history-step-completed", self.onStepCompleted);
            channel.on("cq-history-step-error", self.onStepFailed)
        }
        ;
        self.removeListeners = function() {
            channel.off("cq-history-step-committed");
            channel.off("cq-history-step-completed");
            channel.off("cq-history-step-error")
        }
        ;
        self.setBlocked = function(condition) {
            if (condition === true || condition === undefined)
                self.blocked = true;
            else if (condition === false)
                self.blocked = false;
            return self
        }
        ;
        self.setEdited = function(condition) {
            if (condition === true || condition === undefined)
                self.edited = true;
            else if (condition === false)
                self.edited = false;
            return self
        }
        ;
        self.setOperationActive = function(condition) {
            if (condition === true || condition === undefined)
                self.operationActive = true;
            else if (condition === false)
                self.operationActive = false;
            return self
        }
        ;
        self.isEdited = function() {
            return self.edited
        }
        ;
        self.serialize = function() {
            var stepCnt = self.history.length, data = {
                "a": self.activeStep,
                "bp": self.blockedPaths,
                "s": stepCnt,
                "pv": self.pageVersion,
                "pe": self.edited
            }, stepToProcess;
            for (var i = 0; i < stepCnt; i++) {
                stepToProcess = self.history[i];
                data["s" + i] = stepToProcess.serialize()
            }
            return data
        }
        ;
        self.deserialize = function(data) {
            var stepCnt, stepToProcess, step;
            try {
                self.activeStep = parseInt(data["a"]);
                self.blockedPaths = data["bp"];
                self.pageVersion = data["pv"];
                self.edited = data["pe"];
                self.history.length = 0;
                stepCnt = data["s"];
                for (var i = 0; i < stepCnt; i++) {
                    stepToProcess = data["s" + i];
                    step = new ns.history.Step(self.createStepConfig());
                    self.history.push(step);
                    step.deserialize(stepToProcess)
                }
            } catch (e) {
                self.clear();
                console.log("Error deserializing:", e)
            }
        }
        ;
        self.save = function(pagePath) {
            var serializedHistory;
            pagePath = pagePath ? pagePath : ns.pageInfo.status.path;
            serializedHistory = encodeURIComponent(JSON.stringify(self.serialize()));
            if (serializedHistory)
                self.persistence.save({
                    key: pagePath,
                    undoHistory: serializedHistory
                })
        }
        ;
        self.load = function(pagePath) {
            var serializedHistoryObject;
            pagePath = pagePath ? pagePath : ns.pageInfo.status.path;
            self.persistence.get(pagePath, function(pageData) {
                if (pageData && pageData.undoHistory) {
                    self.clear();
                    serializedHistoryObject = $.parseJSON(decodeURIComponent(pageData.undoHistory));
                    self.deserialize(serializedHistoryObject)
                }
            })
        }
        ;
        self.setPageVersion = function(pageTc) {
            self.pageVersion = pageTc;
            self.edited = false
        }
        ;
        self.getPageVersion = function() {
            return self.pageVersion
        }
        ;
        self.updateUIControls = function() {
            $('[data-history-control\x3d"' + ns.history.History.OPERATION_UNDO + '"]').toggleClass(hiddenCssClass, !self.canUndo());
            $('[data-history-control\x3d"' + ns.history.History.OPERATION_REDO + '"]').toggleClass(hiddenCssClass, !self.canRedo())
        }
        ;
        self.handleInvalidStep = function(validity, isRedo) {
            var message, tempBlocked = isRedo ? Granite.I18n.get("This operation can currently not be redone.") : Granite.I18n.get("This operation can currently not be undone."), blocked = isRedo ? Granite.I18n.get("This operation can not be redone.") : Granite.I18n.get("This operation can not be undone."), title = isRedo ? Granite.I18n.get("Redo unavailable") : Granite.I18n.get("Undo unavailable"), isModal = true;
            switch (validity) {
            case ns.history.Step.BLACKLISTED:
                message = blocked + "\x3cbr\x3e";
                message += Granite.I18n.get("The action references an item that is known to cause problems with undo.");
                break;
            case ns.history.Step.NOT_WHITELISTED:
                isModal = false;
                title = isRedo ? Granite.I18n.get("Redo") : Granite.I18n.get("Undo");
                message = Granite.I18n.get("The action references an item that may cause problems with undo. Proceed at your own risk.");
                break;
            case ns.history.Step.BLOCKED_PATH:
                message = tempBlocked + "\x3cbr\x3e";
                message += Granite.I18n.get("The action references an item that has been moved to a different page by cutting and pasting. Please navigate to that page and undo the paste operation first.");
                break
            }
            if (isModal)
                ns.ui.helpers.prompt({
                    title: title,
                    message: message,
                    actions: [{
                        id: "OK",
                        primary: true,
                        text: Granite.I18n.get("OK", "Label for Ok button")
                    }]
                });
            else
                ns.ui.helpers.notify({
                    content: message,
                    type: ns.ui.helpers.NOTIFICATION_TYPES.WARNING,
                    heading: title
                })
        }
        ;
        self.restoreScreen = function(step, isUndo) {
            var scrollOffset = step.getScrollOffset(), $scrollEl = ns.ContentFrame.wrapper.parent(), editables;
            if (scrollOffset && $scrollEl) {
                $scrollEl.scrollTop(scrollOffset.top);
                $scrollEl.scrollLeft(scrollOffset.left)
            }
        }
        ;
        self.isHistoryTooBig = function() {
            return self.history.length > self.config.maxSteps
        }
        ;
        self.isActivePointerValid = function() {
            return self.activeStep < self.history.length
        }
        ;
        self.pruneHistory = function() {
            var numStepsToRemove;
            if (self.isHistoryTooBig()) {
                numStepsToRemove = self.history.length - self.config.maxSteps;
                self.history.splice(0, numStepsToRemove);
                self.activeStep -= numStepsToRemove
            }
        }
        ;
        self.createStepConfig = function() {
            var $scrollEl = ns.ContentFrame.wrapper.parent()
              , scrollOffset = {
                "top": $scrollEl.scrollTop(),
                "left": $scrollEl.scrollLeft()
            };
            return {
                "scrollOffset": scrollOffset,
                "binaryServletUrl": self.config.binaryServletUrl
            }
        }
        ;
        self._init(config);
        return self
    }
    ;
    ns.history.History.defaults = {
        "maxSteps": 30,
        "persistenceConfig": {
            name: ns.history.persistence.STORE
        },
        "persistenceMode": ns.history.persistence.Mode.ON_STEP,
        "binaryServletUrl": "/libs/wcm/undo/bvm",
        "whitelist": [],
        "blacklist": []
    };
    ns.history.History.OPERATION_UNDO = "undo";
    ns.history.History.OPERATION_REDO = "redo"
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.Step = function(config) {
        var self = {};
        self.actions = [];
        self.executing = false;
        self.executeConfig = null;
        self.scrollOffset = null;
        self._init = function(cfg) {
            cfg = cfg || {};
            self.config = $.extend(true, {}, ns.history.Step.defaults, cfg);
            self.config.step = self;
            self.scrollOffset = self.config.scrollOffset
        }
        ;
        self.getValidity = function(history) {
            var undoStep = ns.history.Step, undoUtils = ns.history.util.Utils, action, actionType, actionCompType, bl = [], blItem, blCompType, blOp, blOpPos, wl = [], wlItem;
            if (history && history.config) {
                bl = history.config.blacklist;
                wl = history.config.whitelist
            }
            for (var a = 0; a < self.actions.length; a++) {
                action = self.actions[a];
                actionCompType = action.getComponentType();
                actionType = ns.history.actions.Registry.getTypeFromAction(action);
                if (actionCompType) {
                    for (var b = 0; b < bl.length; b++) {
                        blItem = bl[b];
                        blOpPos = blItem.lastIndexOf(":");
                        blOp = null;
                        if (blOpPos >= 0) {
                            blCompType = blItem.substring(0, blOpPos);
                            blOp = blItem.substring(blOpPos + 1)
                        } else
                            blCompType = blItem;
                        if (blCompType === actionCompType)
                            if (blOp !== null) {
                                if (blOp === actionType)
                                    return undoStep.BLACKLISTED
                            } else
                                return undoStep.BLACKLISTED
                    }
                    for (var w = 0; w < wl.length; w++) {
                        wlItem = wl[w];
                        if (undoUtils.strEndsWith(wlItem, "*")) {
                            if (undoUtils.strStartsWith(actionCompType, wlItem.substring(0, wlItem.length - 1)))
                                return undoStep.VALID
                        } else if (wlItem === actionCompType)
                            return undoStep.VALID
                    }
                    return undoStep.NOT_WHITELISTED
                }
            }
            return undoStep.VALID
        }
        ;
        self.addAction = function(action) {
            self.actions.push(action)
        }
        ;
        self.undo = function() {
            self.executeUndoRedo(function() {
                this.undo(self.config)
            }, function() {
                this.redo(self.config)
            }, ns.history.History.OPERATION_UNDO, false)
        }
        ;
        self.redo = function() {
            self.executeUndoRedo(function() {
                this.redo(self.config)
            }, function() {
                this.undo(self.config)
            }, ns.history.History.OPERATION_REDO, true)
        }
        ;
        self.getScrollOffset = function() {
            if (self.scrollOffset)
                return self.scrollOffset;
            return null
        }
        ;
        self.getSelection = function(isUndo) {
            var selection = [];
            for (var i = 0; i < self.actions.length; i++)
                self.actions[i].addToSelection(selection, isUndo);
            return selection
        }
        ;
        self.notifyActionCompleted = function(action, success) {
            var _notifyActions, isReverseOrder, isFinished;
            _notifyActions = function() {
                var actionToNotify;
                for (var a = 0; a < self.actions.length; a++) {
                    actionToNotify = self.actions[a];
                    actionToNotify.notifyStepCompleted(self.config, success)
                }
            }
            ;
            if (success) {
                isReverseOrder = self.executeConfig.isReverseOrder;
                self.executeConfig.actionsProcessed.push(action);
                self.executeConfig.actionProcessed += isReverseOrder ? -1 : 1;
                isFinished = !(isReverseOrder ? self.executeConfig.actionProcessed >= 0 : self.executeConfig.actionProcessed < self.actions.length);
                if (!isFinished)
                    self.executeSingleAction();
                else {
                    _notifyActions();
                    setTimeout(function() {
                        channel.trigger("cq-history-step-completed", self)
                    }, 1);
                    self.setExecuting(false);
                    self.executeConfig = null
                }
            } else {
                _notifyActions();
                channel.trigger("cq-history-step-error", self)
            }
        }
        ;
        self.commit = function() {
            var actionCnt = self.actions.length;
            for (var i = 0; i < actionCnt; i++)
                self.actions[i].notifyStepCommitted();
            channel.trigger("cq-history-step-committed", self)
        }
        ;
        self.setExecuting = function(condition) {
            if (condition === true || condition === undefined)
                self.executing = true;
            else if (condition === false)
                self.executing = false;
            return self
        }
        ;
        self.executeUndoRedo = function(fn, counterFn, opType, isReverseOrder) {
            self.setExecuting(true);
            self.executeConfig = {
                "actionProcessed": isReverseOrder ? self.actions.length - 1 : 0,
                "isReverseOrder": isReverseOrder,
                "actionsProcessed": [],
                "fn": fn,
                "counterFn": counterFn,
                "opType": opType,
                "idMap": {}
            };
            self.executeSingleAction()
        }
        ;
        self.executeSingleAction = function() {
            var action = self.actions[self.executeConfig.actionProcessed];
            try {
                self.executeConfig.fn.call(action)
            } catch (e) {
                channel.trigger($.Event("error", {
                    message: Granite.I18n.get("Unable to execute undo/redo step action"),
                    exception: e
                }));
                self.notifyActionCompleted(action, false)
            }
        }
        ;
        self.serialize = function() {
            var obj = {};
            obj["a"] = self.actions.length;
            obj["so"] = self.getScrollOffset();
            for (var i = 0; i < obj["a"]; i++)
                obj["a" + i] = self.actions[i].serialize();
            return obj
        }
        ;
        self.deserialize = function(obj) {
            var actionToDeserialize, action, actionCnt = obj["a"];
            self.actions.length = 0;
            self.scrollOffset = obj["so"];
            for (var i = 0; i < actionCnt; i++) {
                actionToDeserialize = obj["a" + i];
                action = ns.history.actions.Registry.create(actionToDeserialize["t"]);
                action.deserialize(actionToDeserialize);
                self.actions.push(action)
            }
        }
        ;
        self._init(config);
        return self
    }
    ;
    ns.history.Step.defaults = {
        "scrollOffset": {
            "top": 0,
            "left": 0
        }
    };
    ns.history.Step.VALID = 0;
    ns.history.Step.BLOCKED_PATH = 1;
    ns.history.Step.BLACKLISTED = 2;
    ns.history.Step.NOT_WHITELISTED = 3
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.Action = function() {
        this.prototype = {
            getRelevantPaths: function() {
                throw new Error("Granite.author.history.Action#getRelevantPaths must be implemented.");
            },
            getComponentType: function() {
                throw new Error("Granite.author.history.Action#getComponentType must be implemented.");
            },
            checkPreconditions: function(isUndo) {
                throw new Error("Granite.author.history.Action#checkPreconditions must be implemented.");
            },
            undo: function(cfg) {
                throw new Error("Granite.author.history.Action#undo must be implemented.");
            },
            redo: function(cfg) {
                throw new Error("Granite.author.history.Action#redo must be implemented.");
            },
            notifyStepCommitted: function() {
                throw new Error("Granite.author.history.Action#notifyStepCommitted must be implemented.");
            },
            notifyStepCompleted: function(config, success) {
                throw new Error("Granite.author.history.Action#notifyStepCompleted must be implemented.");
            },
            addToSelection: function(selection, isUndo) {
                throw new Error("Granite.author.history.Action#addToSelection must be implemented.");
            },
            serialize: function() {
                throw new Error("Granite.author.history.Action#serialize must be implemented.");
            },
            deserialize: function(obj) {
                throw new Error("Granite.author.history.Action#deserialize must be implemented.");
            }
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var hiddenCssClass = "hide";
    ns.history.Manager = function() {
        var history = null;
        var enabled = true;
        var blocked = false;
        var pagePath = null;
        var originalConfig = null;
        var _doUndo = function() {
            var history;
            if (ns.history.Manager.isEnabled()) {
                history = ns.history.Manager.getHistory();
                if (history && history.canUndo())
                    history.undo()
            }
        };
        var _doRedo = function() {
            var history;
            if (ns.history.Manager.isEnabled()) {
                history = ns.history.Manager.getHistory();
                if (history && history.canRedo())
                    history.redo()
            }
        };
        var _onKeydown = function(event) {
            var isFormElement = function(el) {
                return el && $(el).is("input, textarea, select")
            };
            if (ns.history.Manager.isBlocked() || isFormElement(event.target))
                return;
            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.keyCode == 90)
                _doUndo();
            else if ((event.ctrlKey || event.metaKey) && event.keyCode == 89 || (event.ctrlKey || event.metaKey) && event.shiftKey && event.keyCode == 90)
                _doRedo()
        };
        var _onHistoryEnabled = function() {
            var history = ns.history.Manager.getHistory();
            channel.off("keydown.cq-history-control");
            channel.off("click.cq-history-control");
            channel.on("keydown.cq-history-control", _onKeydown);
            channel.on("click.cq-history-control", '[data-history-control\x3d"undo"]', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                _doUndo()
            });
            channel.on("click", '[data-history-control\x3d"redo"]', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                _doRedo()
            });
            if (history) {
                $('[data-history-control\x3d"undo"]').toggleClass(hiddenCssClass, !history.canUndo());
                $('[data-history-control\x3d"redo"]').toggleClass(hiddenCssClass, !history.canRedo())
            }
        };
        var _onHistoryDisabled = function() {
            channel.off("keydown.cq-history-control");
            channel.off("click.cq-history-control");
            $('[data-history-control\x3d"undo"]').toggleClass(hiddenCssClass, true);
            $('[data-history-control\x3d"redo"]').toggleClass(hiddenCssClass, true)
        };
        return {
            init: function(config) {
                var pathExt = ".html";
                originalConfig = $.extend({}, config);
                ns.history.Manager.setEnabled(config.enabled !== false);
                if (enabled) {
                    if (ns.history.util.Utils.strEndsWith(config.pagePath, pathExt))
                        pagePath = config.pagePath.substring(0, config.pagePath.length - pathExt.length);
                    else
                        pagePath = config.pagePath;
                    history = new ns.history.History(config);
                    if (history.config.persistenceMode == ns.history.persistence.Mode.ON_UNLOAD)
                        $(window).on("beforeunload", function() {
                            history.save(pagePath)
                        });
                    history.load(pagePath);
                    channel.one("cq-content-frame-loaded", function() {
                        channel.on("cq-content-frame-loaded", function(event) {
                            pagePath = event.location.substring(0, event.location.length - pathExt.length);
                            history.clear();
                            history.load(pagePath)
                        })
                    })
                }
            },
            getHistory: function() {
                return history
            },
            getPagePath: function() {
                return pagePath
            },
            getOriginalConfig: function() {
                return originalConfig
            },
            isEnabled: function() {
                return !!history && enabled
            },
            isDisabled: function() {
                return !ns.history.Manager.isEnabled()
            },
            setEnabled: function(condition) {
                if (condition === undefined || condition === true) {
                    enabled = true;
                    _onHistoryEnabled()
                } else if (condition === false) {
                    enabled = false;
                    _onHistoryDisabled()
                }
            },
            isBlocked: function() {
                return blocked
            },
            setBlocked: function(condition) {
                var history = ns.history.Manager.getHistory();
                if (condition === undefined || condition === true) {
                    blocked = true;
                    $('[data-history-control\x3d"undo"]').toggleClass(hiddenCssClass, true);
                    $('[data-history-control\x3d"redo"]').toggleClass(hiddenCssClass, true)
                } else if (condition === false) {
                    blocked = false;
                    if (history) {
                        $('[data-history-control\x3d"undo"]').toggleClass(hiddenCssClass, !history.canUndo());
                        $('[data-history-control\x3d"redo"]').toggleClass(hiddenCssClass, !history.canRedo())
                    }
                }
            },
            detectCachedPage: function(pageTc) {
                var title = Granite.I18n.get("Warning")
                  , message = Granite.I18n.get("This page seems to be outdated, most probably because it was taken from the browser cache.\x3cbr\x3e\x3cbr\x3eA reload of the page is strongly recommended.\x3cbr\x3e\x3cbr\x3eDo you want to reload the page?");
                if (ns.history.Manager.isEnabled()) {
                    var historyTc = history.getPageVersion()
                      , isCached = historyTc != null && pageTc <= historyTc
                      , isEdited = history.isEdited();
                    if (isCached && isEdited)
                        ns.ui.helpers.prompt({
                            title: title,
                            message: message,
                            actions: [{
                                id: "NO",
                                text: Granite.I18n.get("No", "Label for No button")
                            }, {
                                id: "YES",
                                primary: true,
                                text: Granite.I18n.get("Yes", "Label for Yes button")
                            }],
                            callback: function(actionId) {
                                if (actionId === "YES")
                                    window.location.reload()
                            }
                        });
                    else {
                        history.setPageVersion(pageTc);
                        history.save(ns.history.Manager.getPagePath())
                    }
                }
            }
        }
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.Registry = function() {
        var registry = {};
        return {
            register: function(type, cls) {
                registry[type] = cls
            },
            create: function(type) {
                if (!registry.hasOwnProperty(type))
                    throw new Error("Unknown undo/redo action type: " + type);
                return new registry[type]
            },
            getTypeFromAction: function(action) {
                var type = null;
                for (var typeToCheck in registry)
                    if (registry.hasOwnProperty(typeToCheck))
                        if (registry[typeToCheck] === action.constructor) {
                            type = typeToCheck;
                            break
                        }
                if (type == null)
                    throw new Error("The provided undo/redo action is not of a registered type.");
                return type
            }
        }
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.AbstractAction = function(path) {
        if (arguments.length == 0)
            return;
        this.path = path;
        this.isPathDeleted = false;
        this.initializePathRewriting()
    }
    ;
    ns.util.inherits(ns.history.actions.AbstractAction, ns.history.Action);
    ns.history.actions.AbstractAction.prototype.initializePathRewriting = function() {}
    ;
    ns.history.actions.AbstractAction.prototype.getEditable = function() {
        var editables = ns.editables.find(this.path);
        if (editables.length === 0)
            throw new Error("No editable found for path '" + this.path + "'.");
        return editables[0]
    }
    ;
    ns.history.actions.AbstractAction.prototype.changePath = function(path, changeDef) {
        var oldPath = changeDef.oldPath;
        if (path == oldPath)
            return changeDef.newPath;
        var opLen = oldPath.length;
        if (path.length > opLen && path.substring(0, opLen) == oldPath)
            path = changeDef.newPath + path.substring(opLen);
        return path
    }
    ;
    ns.history.actions.AbstractAction.prototype.getRelevantPaths = function() {
        var paths = [];
        if (self.path)
            paths.push(self.path);
        return paths
    }
    ;
    ns.history.actions.AbstractAction.prototype.getComponentType = function() {
        return this.componentType
    }
    ;
    ns.history.actions.AbstractAction.prototype.checkPreconditions = function(isUndo) {
        return {
            "execute": "true"
        }
    }
    ;
    ns.history.actions.AbstractAction.prototype.notifyStepCommitted = function() {}
    ;
    ns.history.actions.AbstractAction.prototype.notifyStepCompleted = function(cfg, success) {}
    ;
    ns.history.actions.AbstractAction.prototype.serialize = function() {
        return {
            "t": ns.history.actions.Registry.getTypeFromAction(this),
            "p": this.path,
            "ct": this.getComponentType(),
            "ipd": this.isPathDeleted,
            "spc": this.serializeSpecific()
        }
    }
    ;
    ns.history.actions.AbstractAction.prototype.serializeSpecific = function() {
        throw new Error("Granite.author.history.actions.AbstractAction#serializeSpecific must be implemented.");
    }
    ;
    ns.history.actions.AbstractAction.prototype.deserialize = function(obj) {
        this.path = obj.p;
        this.componentType = obj.ct;
        this.isPathDeleted = obj.ipd;
        this.deserializeSpecific(obj.spc);
        this.initializePathRewriting()
    }
    ;
    ns.history.actions.AbstractAction.prototype.deserializeSpecific = function(obj) {
        throw new Error("Granite.author.history.actions.AbstractAction#deserializeSpecific must be implemented.");
    }
    ;
    ns.history.actions.AbstractAction.prototype.undo = function(cfg) {
        throw new Error("Granite.author.history.Action#undo must be implemented.");
    }
    ;
    ns.history.actions.AbstractAction.prototype.redo = function(cfg) {
        throw new Error("Granite.author.history.Action#redo must be implemented.");
    }
    ;
    ns.history.actions.AbstractAction.prototype.addToSelection = function(selection, isUndo) {
        throw new Error("Granite.author.history.Action#addToSelection must be implemented.");
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.AbstractParagraphAction = function(path, componentType) {
        this.componentType = componentType;
        ns.history.actions.AbstractAction.call(this, path)
    }
    ;
    ns.util.inherits(ns.history.actions.AbstractParagraphAction, ns.history.actions.AbstractAction);
    ns.history.actions.AbstractParagraphAction.prototype.restoreBlobs = function(cfg, blobs, isGlobalRestore) {
        var self = this
          , blobCnt = blobs.length
          , finishedCnt = 0
          , restoreSuccess = false
          , promises = []
          , editable = self.getEditable();
        var onBlobRestorationComplete = function() {
            if (restoreSuccess === true)
                try {
                    ns.edit.EditableActions.REFRESH.execute(editable, false).then(function() {
                        editable.afterEdit();
                        ns.overlayManager.recreate(editable)
                    })
                } catch (e) {}
        };
        for (var b = 0; b < blobCnt; b++)
            promises.push(blobs[b].restore(cfg.binaryServletUrl, self.path, isGlobalRestore));
        $.each(promises, function(i, promise) {
            promise.always(function() {
                finishedCnt++;
                if (promise.state() === "resolved")
                    restoreSuccess = true;
                if (finishedCnt === promises.length)
                    onBlobRestorationComplete()
            })
        })
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.UpdateParagraph = function(path, componentType, originalData, changedData, originalBlobs, changedBlobs, isGlobalUpdate) {
        if (arguments.length == 0)
            return;
        ns.history.actions.AbstractParagraphAction.call(this, path, componentType);
        this.originalData = originalData;
        this.changedData = changedData;
        this.originalBlobs = originalBlobs;
        this.changedBlobs = changedBlobs;
        this.isGlobalUpdate = isGlobalUpdate
    }
    ;
    ns.util.inherits(ns.history.actions.UpdateParagraph, ns.history.actions.AbstractParagraphAction);
    ns.history.actions.UpdateParagraph.prototype.initializePathRewriting = function() {
        channel.on("cq-history-paragraph-id-changed", this.onParagraphIdChanged.bind(this))
    }
    ;
    ns.history.actions.UpdateParagraph.prototype.onParagraphIdChanged = function(event, data) {
        if (data)
            if (this.path == data.oldPath)
                if (data.deleted)
                    this.isPathDeleted = true;
                else if (this.isPathDeleted) {
                    this.path = data.newPath;
                    this.isPathDeleted = false
                }
    }
    ;
    ns.history.actions.UpdateParagraph.prototype.undo = function(cfg) {
        var self = this
          , editable = self.getEditable();
        if (self.originalData) {
            self.originalData["./" + Granite.Sling.DELETE_SUFFIX] = "";
            ns.edit.EditableActions.UPDATE.execute(editable, self.originalData).then(function() {
                cfg.step.notifyActionCompleted(self, true)
            })
        }
    }
    ;
    ns.history.actions.UpdateParagraph.prototype.redo = function(cfg) {
        var self = this
          , editable = self.getEditable();
        if (self.changedData)
            ns.edit.EditableActions.UPDATE.execute(editable, self.changedData).then(function() {
                cfg.step.notifyActionCompleted(self, true)
            })
    }
    ;
    ns.history.actions.UpdateParagraph.addToSelection = function(selection, isUndo) {
        try {
            selection.push(this.getEditable())
        } catch (e) {}
    }
    ;
    ns.history.actions.UpdateParagraph.prototype.serializeSpecific = function() {
        return {
            "od": this.originalData,
            "cd": this.changedData,
            "gu": this.isGlobalUpdate
        }
    }
    ;
    ns.history.actions.UpdateParagraph.prototype.deserializeSpecific = function(obj) {
        this.originalData = obj.od;
        this.changedData = obj.cd;
        this.isGlobalUpdate = obj.gu
    }
    ;
    ns.history.actions.Registry.register("updateParagraph", ns.history.actions.UpdateParagraph)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.InsertParagraph = function(path, insertPath, componentType, blobs, createParams) {
        if (arguments.length == 0)
            return;
        ns.history.actions.AbstractParagraphAction.call(this, path, componentType);
        this.insertPath = insertPath;
        this.blobs = blobs;
        this.isInsertPathDeleted = false;
        this.createParams = createParams ? createParams : {};
        this.isCopyFromPathDeleted = false
    }
    ;
    ns.util.inherits(ns.history.actions.InsertParagraph, ns.history.actions.AbstractParagraphAction);
    ns.history.actions.InsertParagraph.prototype.initializePathRewriting = function() {
        channel.on("cq-history-paragraph-id-changed", this.onParagraphIdChanged.bind(this))
    }
    ;
    ns.history.actions.InsertParagraph.prototype.onParagraphIdChanged = function(event, data) {
        if (data) {
            if (this.path == data.oldPath)
                if (data.deleted)
                    this.isPathDeleted = true;
                else if (this.isPathDeleted || data.moved) {
                    this.path = data.newPath;
                    this.isPathDeleted = false
                }
            if (this.createParams["./@CopyFrom"] == data.oldPath)
                if (data.deleted)
                    this.isCopyFromPathDeleted = true;
                else if (this.isCopyFromPathDeleted || data.moved) {
                    this.createParams["./@CopyFrom"] = data.newPath;
                    this.isCopyFromPathDeleted = false
                }
            if (this.insertPath == data.oldPath)
                if (data.deleted)
                    this.isInsertPathDeleted = true;
                else if (this.isInsertPathDeleted || data.moved) {
                    this.insertPath = data.newPath;
                    this.isInsertPathDeleted = false
                }
        }
    }
    ;
    ns.history.actions.InsertParagraph.prototype.onEditableReady = function(cfg) {
        var self = this;
        if (self.blobs)
            self.restoreBlobs(cfg, self.blobs);
        cfg.step.notifyActionCompleted(this, true)
    }
    ;
    ns.history.actions.InsertParagraph.prototype.undo = function(cfg) {
        var self = this
          , editable = self.getEditable()
          , editableToolbarShowing = editable === ns.selection.getCurrentActive();
        if (editableToolbarShowing) {
            ns.selection.deselectAll();
            ns.selection.deactivateCurrent();
            ns.EditorFrame.editableToolbar.close()
        }
        ns.edit.EditableActions.DELETE.execute([editable], {
            "preventAddHistory": true
        }).then(function() {
            var mappedId = {
                "oldPath": self.path,
                "newPath": null,
                "deleted": true
            };
            channel.trigger("cq-history-paragraph-id-changed", mappedId);
            cfg.step.executeConfig.idMap[self.path] = mappedId;
            cfg.step.notifyActionCompleted(self, true)
        })
    }
    ;
    ns.history.actions.InsertParagraph.prototype.redo = function(cfg) {
        var self = this
          , editableNeighbors = ns.editables.find(this.insertPath)
          , editableNeighbor = null
          , insertBehavior = ns.persistence.PARAGRAPH_ORDER.before
          , components = ns.components.find({
            "resourceType": this.componentType
        })
          , component = null;
        if (editableNeighbors.length !== 0)
            editableNeighbor = editableNeighbors[0];
        if (components.length !== 0) {
            component = components[0];
            if (component.componentConfig)
                component.setExtraParams(self.createParams)
        }
        if (!editableNeighbor && !component)
            ;
        else
            ns.editableHelper.actions.INSERT.execute(component, insertBehavior, editableNeighbor, {
                "preventAddHistory": true
            }).then(function(data) {
                var newPath = data && data.newPath ? data.newPath : "";
                var mappedId = {
                    "oldPath": self.path,
                    "newPath": newPath,
                    "deleted": false
                };
                self.path = newPath;
                channel.trigger("cq-history-paragraph-id-changed", mappedId);
                cfg.step.executeConfig.idMap[self.path] = mappedId;
                self.onEditableReady(cfg)
            })
    }
    ;
    ns.history.actions.InsertParagraph.prototype.addToSelection = function(selection, isUndo) {
        try {
            if (!isUndo)
                selection.push(this.getEditable())
        } catch (e) {}
    }
    ;
    ns.history.actions.InsertParagraph.prototype.serializeSpecific = function() {
        return {
            "ip": this.insertPath,
            "iipd": this.isInsertPathDeleted,
            "cp": this.createParams,
            "b": ns.history.util.Utils.serializeBlobs(this.blobs),
            "icfpd": this.isCopyFromPathDeleted
        }
    }
    ;
    ns.history.actions.InsertParagraph.prototype.deserializeSpecific = function(obj) {
        this.insertPath = obj.ip;
        this.isInsertPathDeleted = obj.iipd;
        this.createParams = obj.cp;
        this.blobs = ns.history.util.Utils.createBlobsFromSerialized(obj.b);
        this.isCopyFromPathDeleted = obj.icfpd
    }
    ;
    ns.history.actions.Registry.register("insertParagraph", ns.history.actions.InsertParagraph)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.DeleteParagraph = function(path, insertPath, parData, blobs, compInfo) {
        if (arguments.length == 0)
            return;
        ns.history.actions.AbstractParagraphAction.call(this, path, parData["sling:resourceType"]);
        this.insertPath = insertPath;
        this.isInsertPathDeleted = false;
        this.parData = parData;
        this.blobs = blobs;
        this.compInfo = compInfo
    }
    ;
    ns.util.inherits(ns.history.actions.DeleteParagraph, ns.history.actions.AbstractParagraphAction);
    ns.history.actions.DeleteParagraph.prototype.initializePathRewriting = function() {
        channel.on("cq-history-paragraph-id-changed", this.onParagraphIdChanged.bind(this))
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.onParagraphIdChanged = function(event, data) {
        if (data) {
            if (this.path == data.oldPath)
                if (data.deleted)
                    this.isPathDeleted = true;
                else if (this.isPathDeleted || data.moved) {
                    this.path = data.newPath;
                    this.isPathDeleted = false
                }
            if (this.insertPath == data.oldPath)
                if (data.deleted)
                    this.isInsertPathDeleted = true;
                else if (this.isInsertPathDeleted || data.moved) {
                    this.insertPath = data.newPath;
                    this.isInsertPathDeleted = false
                }
        }
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.onEditableReady = function(cfg) {
        var self = this
          , editable = self.getEditable();
        if (self.blobs && self.blobs.length > 0)
            self.restoreBlobs(cfg, self.blobs);
        editable.afterEdit();
        cfg.step.notifyActionCompleted(self, true)
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.undo = function(cfg) {
        var self = this, components = ns.components.find({
            "resourceType": self.compInfo.type
        }), component = null, editableNeighbors, editableNeighbor = null, insertBehavior = ns.persistence.PARAGRAPH_ORDER.before, insertPath = self.insertPath, pathSep, params;
        if (!insertPath) {
            insertPath = self.path;
            pathSep = insertPath.lastIndexOf("/");
            if (pathSep < 0 && pathSep >= insertPath.length - 1)
                throw new Error("No parent path detectable for '" + self.path + "'.");
            insertPath = insertPath.substring(0, pathSep) + "/*";
            insertBehavior = ns.persistence.PARAGRAPH_ORDER.before
        }
        editableNeighbors = ns.editables.find(insertPath);
        if (editableNeighbors.length > 0)
            editableNeighbor = editableNeighbors[0];
        if (components.length > 0)
            component = $.extend(true, {}, components[0]);
        if (!editableNeighbor)
            throw new Error("No editable available at desired insert point: " + insertPath);
        else if (!component)
            throw new Error("No component found of resource type: " + self.compInfo.type);
        else {
            params = ns.history.util.Utils.jsonToSlingParameters(self.parData);
            if (component.componentConfig)
                component.setExtraParams(params);
            ns.editableHelper.actions.INSERT.execute(component, insertBehavior, editableNeighbor, {
                "preventAddHistory": true
            }).then(function(data) {
                var newPath = data && data.newPath ? data.newPath : "";
                var mappedId = {
                    "oldPath": self.path,
                    "newPath": newPath,
                    "deleted": false
                };
                self.path = newPath;
                channel.trigger("cq-history-paragraph-id-changed", mappedId);
                cfg.step.executeConfig.idMap[self.path] = mappedId;
                self.onEditableReady(cfg)
            })
        }
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.redo = function(cfg) {
        var self = this
          , editable = self.getEditable()
          , editableToolbarShowing = editable === ns.selection.getCurrentActive();
        if (editableToolbarShowing) {
            ns.selection.deselectAll();
            ns.selection.deactivateCurrent();
            ns.EditorFrame.editableToolbar.close()
        }
        ns.editableHelper.actions.DELETE.execute([editable], {
            "preventAddHistory": true
        }).then(function() {
            var mappedId = {
                "oldPath": self.path,
                "newPath": null,
                "deleted": true
            };
            channel.trigger("cq-history-paragraph-id-changed", mappedId);
            cfg.step.executeConfig.idMap[self.path] = mappedId;
            cfg.step.notifyActionCompleted(self, true)
        })
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.notifyStepCommitted = function() {
        var mappedId = {
            "oldPath": this.path,
            "newPath": null,
            "deleted": true
        };
        channel.trigger("cq-history-paragraph-id-changed", mappedId)
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.addToSelection = function(selection, isUndo) {
        try {
            if (isUndo)
                selection.push(this.getEditable())
        } catch (e) {}
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.serializeSpecific = function() {
        return {
            "ip": this.insertPath,
            "iipd": this.isInsertPathDeleted,
            "pd": this.parData,
            "b": ns.history.util.Utils.serializeBlobs(this.blobs),
            "ci": this.compInfo
        }
    }
    ;
    ns.history.actions.DeleteParagraph.prototype.deserializeSpecific = function(obj) {
        this.insertPath = obj.ip;
        this.isInsertPathDeleted = obj.iipd;
        this.parData = obj.pd;
        this.blobs = ns.history.util.Utils.createBlobsFromSerialized(obj.b);
        this.compInfo = obj.ci
    }
    ;
    ns.history.actions.Registry.register("removeParagraph", ns.history.actions.DeleteParagraph)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.history.actions.MoveParagraph = function(path, srcPath, srcInsertPath, destInsertPath, resourceType, insertBehavior) {
        if (arguments.length == 0)
            return;
        ns.history.actions.AbstractAction.call(this, path);
        this.srcPath = srcPath;
        this.srcInsertPath = srcInsertPath;
        this.destInsertPath = destInsertPath;
        this.insertBehavior = insertBehavior;
        this.isSrcPathDeleted = false;
        this.isSrcInsertPathDeleted = false;
        this.isDestInsertPathDeleted = false;
        this.resourceType = resourceType;
        this.crossPageStep = 0;
        this.isDirty = false;
        var mappedId = {
            "oldPath": srcPath,
            "newPath": this.path,
            "moved": true
        };
        channel.trigger("cq-history-paragraph-id-changed", mappedId)
    }
    ;
    ns.util.inherits(ns.history.actions.MoveParagraph, ns.history.actions.AbstractAction);
    ns.history.actions.MoveParagraph.prototype.initializePathRewriting = function() {
        channel.on("cq-history-paragraph-id-changed", this.onParagraphIdChanged.bind(this))
    }
    ;
    ns.history.actions.MoveParagraph.prototype.onParagraphIdChanged = function(event, data) {
        if (data) {
            if (this.path == data.oldPath)
                if (data.deleted)
                    this.isPathDeleted = true;
                else if (this.isPathDeleted) {
                    this.path = data.newPath;
                    this.isPathDeleted = false
                }
            if (this.srcPath == data.oldPath)
                if (data.deleted)
                    this.isSrcPathDeleted = true;
                else if (this.isSrcPathDeleted) {
                    this.srcPath = data.newPath;
                    this.isSrcPathDeleted = false
                }
            if (this.srcInsertPath == data.oldPath)
                if (data.deleted)
                    this.isSrcInsertPathDeleted = true;
                else if (this.isSrcInsertPathDeleted || data.moved) {
                    this.srcInsertPath = data.newPath;
                    this.isSrcInsertPathDeleted = false
                }
            if (this.destInsertPath == data.oldPath)
                if (data.deleted)
                    this.isDestInsertPathDeleted = true;
                else if (this.isDestInsertPathDeleted || data.moved) {
                    this.destInsertPath = data.newPath;
                    this.isDestInsertPathDeleted = false
                }
        }
    }
    ;
    ns.history.actions.MoveParagraph.prototype.undo = function(cfg) {
        var self = this, editable = self.getEditable(), moveDestEditableResult = ns.editables.find(self.srcInsertPath), moveDestEditable;
        if (!editable)
            throw new Error("Could not determine editable to move.");
        if (moveDestEditableResult.length === 0)
            ;
        else {
            moveDestEditable = moveDestEditableResult[0];
            ns.editableHelper.actions.MOVE.execute(editable, "before", moveDestEditable, {
                "preventAddHistory": true
            }).then(function(data) {
                var mappedId;
                if (data && data.newPath) {
                    mappedId = {
                        "oldPath": self.path,
                        "newPath": data.newPath,
                        "moved": true
                    };
                    self.path = data.newPath;
                    channel.trigger("cq-history-paragraph-id-changed", mappedId);
                    cfg.step.executeConfig.idMap[self.path] = mappedId;
                    cfg.step.notifyActionCompleted(self, true)
                } else
                    cfg.step.notifyActionCompleted(self, false)
            })
        }
    }
    ;
    ns.history.actions.MoveParagraph.prototype.redo = function(cfg) {
        var self = this, editable = self.getEditable(), moveDestEditables = ns.editables.find(self.destInsertPath), moveDestEditable;
        if (!editable)
            ;
        else if (moveDestEditables.length !== 0) {
            moveDestEditable = moveDestEditables[0];
            ns.editableHelper.actions.MOVE.execute(editable, self.insertBehavior, moveDestEditable, {
                "preventAddHistory": true
            }).then(function(data) {
                if (data && data.newPath) {
                    var mappedId = {
                        "oldPath": self.path,
                        "newPath": data.newPath,
                        "moved": true
                    };
                    self.path = data.newPath;
                    channel.trigger("cq-history-paragraph-id-changed", mappedId);
                    cfg.step.executeConfig.idMap[self.path] = mappedId;
                    cfg.step.notifyActionCompleted(self, true)
                } else
                    cfg.step.notifyActionCompleted(self, false)
            })
        } else
            ;
    }
    ;
    ns.history.actions.MoveParagraph.prototype.addToSelection = function(selection, isUndo) {
        try {
            selection.push(this.getEditable())
        } catch (e) {}
    }
    ;
    ns.history.actions.MoveParagraph.prototype.serializeSpecific = function() {
        return {
            "sp": this.srcPath,
            "sip": this.srcInsertPath,
            "dip": this.destInsertPath,
            "ispd": this.isSrcPathDeleted,
            "isipd": this.isSrcInsertPathDeleted,
            "idipd": this.isDestInsertPathDeleted,
            "ib": this.insertBehavior,
            "rt": this.resourceType,
            "cps": this.crossPageStep,
            "id": this.isDirty
        }
    }
    ;
    ns.history.actions.MoveParagraph.prototype.deserializeSpecific = function(obj) {
        this.srcPath = obj.sp;
        this.srcInsertPath = obj.sip;
        this.destInsertPath = obj.dip;
        this.isSrcPathDeleted = obj.ispd;
        this.isSrcInsertPathDeleted = obj.isipd;
        this.isDestInsertPathDeleted = obj.idipd;
        this.insertBehavior = obj.ib;
        this.resourceType = obj.rt;
        this.crossPageStep = obj.cps;
        this.isDirty = obj.id
    }
    ;
    ns.history.actions.Registry.register("moveParagraph", ns.history.actions.MoveParagraph)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function onKey(event) {
        ns.selection.modifierPressed = event.ctrlKey || event.metaKey
    }
    function onFocus() {
        ns.selection.modifierPressed = false
    }
    var DEFAULT_CONFIG = {
        onOverlayHover: $.noop,
        onOverlayClick: $.noop,
        onOverlayFastDblClick: $.noop,
        onOverlaySlowDblClick: $.noop,
        onOutsideOverlayClick: $.noop,
        ignoreGroupSelection: true
    };
    ns.selection = {
        selected: [],
        active: undefined,
        modifierPressed: false,
        buttonPressed: false,
        bindEvents: function(config) {
            var actualConfig = $.extend({}, DEFAULT_CONFIG, config);
            this.unbindEvents();
            channel.on("cq-overlay-hover.selection", actualConfig.onOverlayHover).on("cq-overlay-click.selection", actualConfig.onOverlayClick).on("cq-overlay-fast-dblclick.selection", actualConfig.onOverlayFastDblClick).on("cq-overlay-slow-dblclick.selection", actualConfig.onOverlaySlowDblClick).on("cq-overlay-hold.selection", actualConfig.onOverlaySlowDblClick).on("cq-overlay-outside-click.selection", actualConfig.onOutsideOverlayClick);
            if (!actualConfig.ignoreGroupSelection) {
                channel.on("keydown.selection", onKey).on("keyup.selection", onKey);
                $(window).on("focus.selection", onFocus)
            }
        },
        unbindEvents: function() {
            channel.off("cq-overlay-hover.selection").off("cq-overlay-click.selection").off("cq-overlay-fast-dblclick.selection").off("cq-overlay-slow-dblclick.selection").off("cq-overlay-hold.selection").off("cq-overlay-outside-click.selection").off("keydown.selection").off("keyup.selection").off("selectstart.selection");
            $(window).off("focus.selection")
        },
        isSingleSelection: function() {
            return !this.modifierPressed && !this.buttonPressed
        },
        isGroupSelection: function() {
            Granite.author.util.deprecated("Use Granite.author.selection.isSingleSelection instead");
            return ns.selection.modifierPressed || ns.selection.buttonPressed
        },
        getCurrentActive: function() {
            return this.active
        },
        getAllSelected: function() {
            return this.selected
        },
        getPreviousSelected: function() {
            var length = this.selected.length;
            return length >= 2 ? this.selected[length - 2] : undefined
        },
        select: function(editable) {
            var found = this.selected.filter(function(selected) {
                return selected.path === editable.path
            });
            if (found.length === 0) {
                this.selected.push(editable);
                if (editable.overlay)
                    editable.overlay.setSelected(true)
            }
        },
        deselect: function(editable) {
            if (editable.overlay)
                editable.overlay.setSelected(false);
            this.selected.splice(this.selected.indexOf(editable), 1)
        },
        deselectAll: function() {
            this.selected.forEach(function(selected) {
                var overlay = selected.overlay;
                if (overlay)
                    overlay.setSelected(false)
            });
            this.buttonPressed = false;
            this.selected = []
        },
        activate: function(editable) {
            if (editable.overlay)
                editable.overlay.setActive(true);
            this.active = editable
        },
        deactivateCurrent: function() {
            if (this.active) {
                if (this.active.overlay)
                    this.active.overlay.setActive(false);
                this.active = undefined
            }
        }
    };
    Object.defineProperty(ns.selection, "length", {
        get: function() {
            return this.getAllSelected().length
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.overlayManager = function() {
        var self = {}, $doc = $(document), $win = $(window), contentContainer = $doc.find("#ContentWrapper"), container = $doc.find("#OverlayWrapper"), overlayConstructor = null, suspended = false, fastDoubleClickDelay = 300, lastClickTapTime, lastClickedTappedEditable;
        function repositionOverlay(editable) {
            var parent;
            if (editable.overlay) {
                parent = ns.editables.getParent(editable);
                if (parent && parent.overlay && !parent.overlay.currentPos)
                    repositionOverlay(parent);
                editable.overlay.position(editable, parent)
            }
        }
        function isDescendantOf(editableA, editableB) {
            return editableA.path && editableB.path && editableA.path.indexOf(editableB.path, 0) === 0 && editableA.path[editableB.path.length] === "/"
        }
        function excludeDescendants(editables) {
            if (!editables || editables.length === 0)
                return [];
            var all = editables.slice(0);
            var top = [];
            while (all.length > 0) {
                var currentParent = all.shift();
                for (var i = all.length - 1; i >= 0; i--)
                    if (isDescendantOf(currentParent, all[i]))
                        currentParent = all.splice(i, 1)[0];
                    else if (isDescendantOf(all[i], currentParent))
                        all.splice(i, 1);
                top.push(currentParent)
            }
            return top
        }
        function getEditable(event) {
            return ns.editables.find($(event.currentTarget).data("path"))[0]
        }
        self.setup = function() {
            ns.editables.map(self.create)
        }
        ;
        self.teardown = function() {
            ns.editables.map(self.destroy)
        }
        ;
        self.create = function(editable) {
            if (!overlayConstructor)
                return;
            if (!editable.overlay) {
                var parent = ns.editables.getParent(editable);
                if (parent && !parent.overlay)
                    self.create(parent);
                if (!editable.overlay)
                    editable.overlay = new overlayConstructor(editable,parent ? parent.overlay.dom : container);
                ns.editables.getChildren(editable, true).forEach(function(child) {
                    self.create(child)
                })
            }
        }
        ;
        self.destroy = function(editable) {
            if (editable.overlay) {
                editable.overlay.remove();
                editable.overlay = null;
                ns.editables.getChildren(editable).forEach(function(child) {
                    self.destroy(child)
                })
            }
        }
        ;
        self.recreate = function(editable) {
            this.destroy(editable);
            this.create(editable)
        }
        ;
        self.recreateAll = function(cfg) {
            var editables = excludeDescendants(cfg && cfg.editables || []);
            var i = editables.length - 1;
            for (; i >= 0; i--)
                self.recreate(editables[i])
        }
        ;
        self.reposition = function() {
            var deferred = $.Deferred();
            for (var i = 0; i < ns.editables.length; i++)
                if (ns.editables[i].overlay)
                    ns.editables[i].overlay.currentPos = null;
            window.requestAnimationFrame(function() {
                for (var i = ns.editables.length - 1; i >= 0; i--)
                    repositionOverlay(ns.editables[i]);
                var height = null;
                if (contentContainer.length > 0)
                    height = contentContainer.get(0).scrollHeight;
                else if (container.length > 0)
                    height = container.get(0).scrollHeight;
                if (height !== null)
                    container.css({
                        height: height
                    });
                deferred.resolve();
                channel.trigger("cq-overlays-repositioned")
            });
            return deferred.promise()
        }
        ;
        self.startObservation = function() {
            Granite.author.util.deprecated("Use event cq-contentframe-layout-change instead")
        }
        ;
        self.stopObservation = function() {
            Granite.author.util.deprecated("Use event cq-contentframe-layout-change instead")
        }
        ;
        self.setOverlaysVisible = function(condition) {
            container.toggleClass("is-hidden-children", condition === false)
        }
        ;
        self.setVisible = function(condition) {
            container.toggleClass("is-hidden", suspended || condition === false)
        }
        ;
        self.getOverlayRendering = function() {
            return overlayConstructor
        }
        ;
        self.setOverlayRendering = function(fn) {
            overlayConstructor = fn
        }
        ;
        self.resetOverlayRendering = function() {
            overlayConstructor = ns.ui.Overlay
        }
        ;
        container.on("click keypress", ".cq-Overlay--component", function(event) {
            var enterKey = 13;
            var spaceKey = 32;
            if (event.type === "keypress" && event.which !== enterKey && event.which !== spaceKey)
                return;
            event.stopImmediatePropagation();
            event.preventDefault();
            var editable = getEditable(event);
            var now = (new Date).getTime();
            if (editable.overlay.isActive() && editable === lastClickedTappedEditable) {
                channel.trigger($.Event(now - lastClickTapTime <= fastDoubleClickDelay ? "cq-overlay-fast-dblclick" : "cq-overlay-slow-dblclick", {
                    inspectable: editable,
                    editable: editable,
                    originalEvent: event
                }));
                lastClickedTappedEditable = null
            } else {
                channel.trigger($.Event("cq-overlay-click", {
                    inspectable: editable,
                    editable: editable,
                    originalEvent: event
                }));
                lastClickTapTime = now;
                lastClickedTappedEditable = editable
            }
        });
        container.finger("taphold", ".cq-Overlay--component", function(event) {
            var editable = getEditable(event);
            if (editable.overlay.isActive())
                channel.trigger($.Event("cq-overlay-hold", {
                    inspectable: editable,
                    editable: editable,
                    originalEvent: event
                }))
        });
        container.pointer("click", function(event) {
            if (!$(event.target).hasClass("cq-Overlay")) {
                lastClickedTappedEditable = null;
                channel.trigger($.Event("cq-overlay-outside-click", {
                    originalEvent: event
                }))
            }
        });
        if (!ns.device.isIpad)
            container.on("mouseover mouseout", ".cq-Overlay--component:not(.is-disabled)", function(event) {
                var editable = getEditable(event);
                channel.trigger($.Event("cq-overlay-hover", {
                    inspectable: editable,
                    editable: editable,
                    originalEvent: event
                }))
            });
        $win.on("resize", $.debounce(100, function(event) {
            self.reposition()
        }));
        channel.on("cq-contentframe-layout-change", self.reposition);
        channel.on("cq-overlays-create", self.recreateAll);
        channel.on("cq-show-overlays", function() {
            suspended = false;
            self.setVisible(true)
        });
        channel.on("cq-hide-overlays", function() {
            suspended = true;
            self.setVisible(false)
        });
        channel.on("cq-sidepanel-beforetoggle", function() {
            self.setOverlaysVisible(false)
        });
        channel.on("cq-sidepanel-aftertoggle", $.debounce(100, function() {
            self.reposition();
            self.setOverlaysVisible(true)
        }));
        channel.on("cq-close-toolbar", function() {
            lastClickedTappedEditable = null
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var pageInfoButtonSelector = "#pageinfo-trigger";
    var pageInfoButton = function() {
        var self = {
            element: $(pageInfoButtonSelector)
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element.hasClass("is-disabled");
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element.toggleClass("is-disabled", !!val)
            }
        });
        return self
    }();
    var currentLayerButtonClass = "js-editor-GlobalBar-layerCurrent";
    var currentLayerButton = function() {
        var self = {
            element: $("." + currentLayerButtonClass),
            setCurrent: function(layer) {
                if (self.element.length > 0)
                    if (layer === "Preview" || layer === "Annotate")
                        self.element.removeClass("is-selected");
                    else {
                        self.element.addClass("is-selected");
                        self.element.attr("data-layer", layer);
                        self.element.text(ns.layerManager.getLayers()[layer].title)
                    }
            }
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element[0].disabled;
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element[0].disabled = !!val
            }
        });
        channel.on("cq-layer-activated", function(event) {
            var layer = event.layer;
            self.setCurrent(layer)
        });
        return self
    }();
    var previewLayerButtonClass = "js-editor-GlobalBar-previewTrigger";
    var previewLayerButton = function() {
        var self = {
            element: $("." + previewLayerButtonClass)
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element[0].disabled;
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element[0].disabled = !!val
            }
        });
        channel.on("cq-layer-activated", function(event) {
            if (self.element.length > 0) {
                var layer = event.layer;
                if (layer === "Preview")
                    self.element.addClass("is-selected");
                else
                    self.element.removeClass("is-selected")
            }
        });
        return self
    }();
    var layerSwitcherClass = "editor-GlobalBar-layerSwitcher";
    var layerSwitcher = function() {
        var self = {
            element: $("." + layerSwitcherClass),
            _popover: $("#selectlayer-popover"),
            empty: function() {
                this._popover.find(".editor-GlobalBar-layerSwitcherPopoverContent").empty()
            },
            addLayer: function(layer) {
                var popover = this._popover[0];
                if (popover) {
                    var popoverContent = popover.querySelector(".editor-GlobalBar-layerSwitcherPopoverContent");
                    if (popoverContent) {
                        var list = popover.querySelector("coral-buttonlist") || new Coral.ButtonList;
                        list.setAttribute("role", "list");
                        var btn = list.items.add({
                            content: {
                                textContent: layer.title
                            },
                            value: layer.name
                        });
                        btn.classList.add("js-editor-LayerSwitcherTrigger");
                        btn.setAttribute("role", "listitem");
                        btn.dataset.layer = layer.name;
                        popoverContent.appendChild(list)
                    }
                }
            }
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element.hasClass("is-disabled");
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element.toggleClass("is-disabled", !!val)
            }
        });
        channel.on("click", ".js-editor-LayerSwitcherTrigger", function() {
            if (self._popover.length > 0)
                self._popover[0].hide()
        });
        channel.on("cq-layer-activated", function(event) {
            var layer = event.layer;
            if (self.element.length > 0)
                if (layer === "Preview" || layer === "Annotate")
                    self.element.removeClass("is-selected");
                else
                    self.element.addClass("is-selected")
        });
        return self
    }();
    var annotationBadgeClass = "editor-GlobalBar-badge";
    var annotationBadge = function() {
        var self = {
            element: $("." + annotationBadgeClass),
            _active: false,
            _val: 0,
            _showIcon: function(icon) {
                if (this.element.length > 0)
                    this.element[0].icon = icon || "noteAdd"
            },
            setValue: function(val) {
                if (this.element.length > 0) {
                    this._val = val;
                    if (this._active)
                        return;
                    if (this._val > 0) {
                        this.element.addClass("editor-GlobalBar-item--badge").removeClass("header-action");
                        this.element[0].icon = "";
                        this.element[0].label.innerHTML = this._val
                    } else {
                        this.element.addClass("header-action").removeClass("editor-GlobalBar-item--badge");
                        this._showIcon()
                    }
                }
            }
        };
        channel.on("cq-layer-activated", function(event) {
            if (self.element.length > 0) {
                var layer = event.layer
                  , prevLayer = event.prevLayer === "Annotate" ? "Edit" : event.prevLayer;
                var overlayWrapper = $("#OverlayWrapper");
                if (layer === "Annotate") {
                    self.element.attr("data-layer", prevLayer);
                    self._active = true;
                    self.element.addClass("header-action").removeClass("endor-Badge editor-GlobalBar-item--badge");
                    self.element[0].label.innerHTML = "";
                    self.element[0].ariaLabel = Granite.I18n.get("Exit Annotation Mode");
                    self.element.attr("style", "display: block");
                    overlayWrapper.attr("role", "region");
                    overlayWrapper.attr("aria-label", Granite.I18n.get("Annotate Mode Edit"));
                    self._showIcon("close")
                } else {
                    self.element.attr("data-layer", "Annotate");
                    self.element.removeAttr("style");
                    self.element[0].ariaLabel = Granite.I18n.get("Annotation Mode");
                    overlayWrapper.removeAttr("role");
                    overlayWrapper.removeAttr("aria-label");
                    self._active = false;
                    self.setValue(self._val)
                }
            }
        });
        return self
    }();
    var contextHubTriggerClass = "js-editor-ContextHubTrigger";
    var contextHubTrigger = function() {
        var self = {
            element: $("." + contextHubTriggerClass),
            toggle: function() {
                channel.trigger("cq-contexthub-toggle")
            }
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element[0].disabled;
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element[0].disabled = !!val
            }
        });
        if (self.element.length > 0) {
            self.element.on("click", function(event) {
                self.toggle()
            });
            channel.on("ch-authoring-hook", function(ev) {
                self.disabled = !ev.visible
            })
        }
        return self
    }();
    var emulatorTriggerClass = "js-editor-EmulatorBar-toggle";
    var emulatorTrigger = function() {
        var self = {
            element: $("." + emulatorTriggerClass)
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element[0].disabled;
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element[0].disabled = !!val
            }
        });
        channel.on("cq-emulatorbar-toggle", function(event, data) {
            self.element.toggleClass("is-selected", data.isOpen)
        });
        return self
    }();
    var sidePanelTriggerClass = "js-editor-SidePanel-toggle";
    var sidePanelTrigger = function() {
        var self = {
            element: $("." + sidePanelTriggerClass)
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element[0].disabled;
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element[0].disabled = !!val
            }
        });
        if (self.element.length > 0)
            channel.on("cq-sidepanel-aftertoggle", function(ev) {
                self.element.toggleClass("is-selected", ns.ui.SidePanel.isOpened())
            });
        return self
    }();
    var styleSelectorTriggerClass = "js-editor-StyleSelector-toggle";
    var styleSelectorTrigger = function() {
        var self = {
            element: $("." + styleSelectorTriggerClass)
        };
        Object.defineProperty(self, "disabled", {
            get: function() {
                if (this.element.length > 0)
                    return this.element[0].disabled;
                return false
            },
            set: function(val) {
                if (this.element.length > 0)
                    this.element[0].disabled = !!val
            }
        });
        return self
    }();
    var globalBarClass = "editor-GlobalBar";
    var actionBarSelector = "." + globalBarClass + " coral-actionbar";
    var globalBar = function() {
        var additionalButtons = [];
        var addBarToPanelHeaderAtFirst = function(newBar) {
            newBar.insertAfter($(".editor-panel-header coral-actionbar"))
        };
        var self = {
            element: $("." + globalBarClass),
            pageInfoButton: pageInfoButton,
            currentLayerButton: currentLayerButton,
            previewLayerButton: previewLayerButton,
            layerSwitcher: layerSwitcher,
            annotationBadge: annotationBadge,
            contextHubTrigger: contextHubTrigger,
            emulatorTrigger: emulatorTrigger,
            sidePanelTrigger: sidePanelTrigger,
            styleSelectorTrigger: styleSelectorTrigger,
            empty: function() {
                var leftItems = $(actionBarSelector)[0].primary.items;
                for (var i = 0; i < additionalButtons.length; i++)
                    leftItems.remove(additionalButtons[i]);
                additionalButtons = []
            },
            addButton: function(cssClass, icon, title) {
                var button = (new Coral.Button).set({
                    icon: ns.ui.coralCompatibility.getIconAttribute(icon),
                    variant: "minimal",
                    title: Granite.I18n.getVar(title)
                });
                var $button = $(button).addClass(cssClass + " editor-GlobalBar-item");
                var leftItems = $(actionBarSelector)[0].primary.items;
                additionalButtons.push(leftItems.add($button[0]));
                return $button
            },
            addBarToPanelHeader: function(newBar, position) {
                if (!(newBar instanceof $))
                    newBar = $(newBar);
                var panelHeader = $(".editor-panel-header");
                position = parseInt(position);
                if (!isNaN(position) && position > -1) {
                    if (0 === position) {
                        addBarToPanelHeaderAtFirst(newBar);
                        return
                    }
                    var $currentBars = panelHeader.children();
                    $currentBars = $currentBars.filter(function() {
                        return this.nodeName.toLowerCase() !== "nav"
                    });
                    if (position < $currentBars.length) {
                        $currentBars.eq(position).before(newBar);
                        return
                    }
                }
                newBar.appendTo(panelHeader)
            }
        };
        channel.on("cq-content-frame-loaded", function(event) {
            $(".editor-GlobalBar-pageTitle").text(Granite.I18n.get(event.title))
        });
        return self
    }();
    var el = $(actionBarSelector)[0];
    Coral.commons.ready(el, function() {
        el && el.removeAttribute("hidden")
    });
    ns.ui.globalBar = globalBar
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var USER_PREF_COOKIE_KEY = "cq-editor-sidepanel";
    var CSS_EMPTY_CONTENT = "js-SidePanel-content--empty";
    var CSS_TOGGLE_SIDEPANEL = "toggle-sidepanel";
    var CSS_SIDEPANEL_CLOSED = "sidepanel-closed";
    var CSS_SIDEPANEL_OPENED = "sidepanel-opened";
    var CSS_SIDEPANEL_RESIZER = "sidepanel-resizer";
    var CSS_SIDEPANEL_RESIZING = "sidepanel-resizing";
    var CSS_SIDEPANEL_CONTENT = "sidepanel-content";
    var CSS_SIDEPANEL_HEADERTITLE = "sidepanel-header-title";
    var CSS_SIDEPANEL_ANCHOR_IN_TABS = ".sidepanel coral-tabview";
    var EVENT_SIDEPANEL_TABSWITCH = "cq-sidepanel-tab-switched.sidepanel";
    var EVENT_SIDEPANEL_TAB_CHANGE = "coral-tabview:change";
    var EVENT_SIDEPANEL_RESIZE = "resize.sidepanel";
    var EVENT_SIDEPANEL_TRANSITIONEND = "transitionend.sidepanel";
    var EVENT_SIDEPANEL_CLICK = "click.sidepanel";
    var SIDEPANEL_SELECTOR = "#SidePanel";
    var DIALOG_SELECTOR = "coral-dialog.cq-Dialog";
    var DIALOG_OPENED_CLASS = "cq-dialog-is-open";
    var DIALOG_BACKDROP_OPENED_CLASS = "is-open";
    var SIDEPANEL_NAMESPACE = ".sidepanel";
    var OVERLAY_BEFORE_OPEN = "coral-overlay:beforeopen";
    var DIALOG_BEFORE_CLOSE = "dialog-beforeclose";
    var $backdrop = $();
    ns.ui.SidePanel = {
        $el: $(SIDEPANEL_SELECTOR),
        $anchor: $("#Content"),
        TAB_CLASSES: {
            ASSETS: "sidepanel-tab-assets",
            COMPONENTS: "sidepanel-tab-components",
            CONTENT: "sidepanel-tab-content"
        },
        id: "SidePanel",
        _resizer: null,
        _openOnRestore: false,
        _tabView: null,
        init: function() {
            this._tabView = this.$el.find("coral-tabview").get(0);
            if (this._getUserPrefCookie() === "open" && !this.isOpened())
                this.open(false);
            channel.off(EVENT_SIDEPANEL_TAB_CHANGE, CSS_SIDEPANEL_ANCHOR_IN_TABS).on(EVENT_SIDEPANEL_TAB_CHANGE, CSS_SIDEPANEL_ANCHOR_IN_TABS, this._handleTabNavClick.bind(this));
            channel.off(EVENT_SIDEPANEL_TABSWITCH).on(EVENT_SIDEPANEL_TABSWITCH, this._handleTabSwitch.bind(this));
            channel.off(EVENT_SIDEPANEL_CLICK, "." + CSS_TOGGLE_SIDEPANEL).on(EVENT_SIDEPANEL_CLICK, "." + CSS_TOGGLE_SIDEPANEL, this._handleToggleClick.bind(this));
            $(window).off(EVENT_SIDEPANEL_RESIZE).on(EVENT_SIDEPANEL_RESIZE, $.debounce(500, true, this._handleWindowResizeBegin.bind(this))).off(EVENT_SIDEPANEL_RESIZE).on(EVENT_SIDEPANEL_RESIZE, $.debounce(500, false, this._handleWindowResizeEnd.bind(this)));
            channel.off(OVERLAY_BEFORE_OPEN + SIDEPANEL_NAMESPACE).on(OVERLAY_BEFORE_OPEN + SIDEPANEL_NAMESPACE, DIALOG_SELECTOR, this._showContentBackdrop.bind(this));
            channel.off(DIALOG_BEFORE_CLOSE + SIDEPANEL_NAMESPACE).on(DIALOG_BEFORE_CLOSE + SIDEPANEL_NAMESPACE, DIALOG_SELECTOR, this._hideContentBackdrop.bind(this))
        },
        open: function(keepRestorable) {
            $("#sidepanel-toggle-button").attr("aria-expanded", "true");
            if (this.$el.hasClass(CSS_SIDEPANEL_OPENED))
                return;
            this._cleanInlineCss();
            this._triggerToggle();
            this.$el.removeClass(CSS_SIDEPANEL_CLOSED);
            this.$el.addClass(CSS_SIDEPANEL_OPENED);
            this.$el.get()[0].querySelector("._coral-Tabs-item").focus();
            this._setUserPrefCookie("open");
            if (keepRestorable === false)
                this._openOnRestore = true;
            if (ns.device.isDesktop() && this.$el.find("." + CSS_SIDEPANEL_RESIZER).length === 0)
                this._addResizer();
            this._triggerTabSwitched();
            this._triggerResized()
        },
        close: function(keepRestorable) {
            $("#sidepanel-toggle-button").attr("aria-expanded", "false");
            if (this.$el.hasClass(CSS_SIDEPANEL_CLOSED))
                return;
            this._cleanInlineCss();
            this._triggerToggle();
            this.$el.addClass(CSS_SIDEPANEL_CLOSED);
            this.$el.removeClass(CSS_SIDEPANEL_OPENED);
            this._setUserPrefCookie("closed");
            if (keepRestorable === false)
                this._openOnRestore = false;
            this._triggerResized()
        },
        restore: function() {
            if (this._openOnRestore === true)
                this.open(true);
            else
                this.close(true)
        },
        isOpened: function() {
            return this.$el.hasClass(CSS_SIDEPANEL_OPENED)
        },
        getWidth: function() {
            return this.isOpened() ? this.$el.width() : 0
        },
        loadContent: function(options) {
            function success(data) {
                var $html = $(data);
                this.$el.find("." + CSS_SIDEPANEL_CONTENT).append($html);
                channel.trigger("foundation-contentloaded")
            }
            var html = this.$el.find(options.selector).get(0);
            if (html)
                return $.Deferred().resolveWith(options, html).promise();
            else
                return $.get(options.path).then(success.bind(this))
        },
        showContent: function(contentClassName) {
            this.$el.find("." + CSS_SIDEPANEL_CONTENT).children().each(function() {
                var $child = $(this);
                if ($child.is(CSS_TOGGLE_SIDEPANEL))
                    return;
                $child.toggle($child.hasClass(contentClassName))
            });
            this._triggerTabSwitched();
            ns.ui.globalBar.sidePanelTrigger.disabled = contentClassName === CSS_EMPTY_CONTENT
        },
        showEmptyContent: function() {
            this.showContent(CSS_EMPTY_CONTENT)
        },
        showLayer: function(content) {
            Granite.author.util.deprecated("Use Granite.author.ui.SidePanel.showLayer instead");
            this.showContent(content)
        },
        showEmptyLayer: function() {
            Granite.author.util.deprecated("Use Granite.author.ui.SidePanel.showEmptyLayer instead");
            this.showEmptyContent()
        },
        toggleTab: function(tabClass, enable) {
            var tab = this._getTab(tabClass);
            if (enable)
                tab.removeAttribute("disabled");
            else {
                tab.setAttribute("disabled", "");
                var tabItems = this._tabView.tabList.items.getAll();
                if (!tabItems.filter(function(item) {
                    return !(item.hasAttribute("disabled") || item.hasAttribute("hidden"))
                }).length)
                    this.close()
            }
        },
        getSelectedTabClass: function() {
            return this._tabView.panelStack.selectedItem.querySelector(".sidepanel-tab").className.match(/sidepanel-tab-[\w]*/)[0]
        },
        _getTab: function(tabClass) {
            var sidePanelTab = this._tabView.querySelector("." + tabClass);
            if (!sidePanelTab)
                return;
            var tabPanel = sidePanelTab.closest("coral-panel");
            if (!tabPanel)
                return;
            return this._tabView.querySelector("#" + tabPanel.getAttribute("aria-labelledby"))
        },
        _triggerTabSwitched: function(event) {
            var $tab = this.$el.find("coral-panel:selected:visible .sidepanel-tab");
            if (event) {
                var $tabCtrl = $(event.target).find("coral-tab:selected");
                $tab = $("#" + $tabCtrl.attr("aria-controls") + " .sidepanel-tab")
            }
            if ($tab.length) {
                var tabName = $tab.attr("class").match(/sidepanel-tab-[\w]*/)[0];
                channel.trigger($.Event("cq-sidepanel-tab-switched", {
                    tab: $tab,
                    tabName: tabName
                }))
            }
        },
        _triggerToggle: function() {
            channel.trigger("cq-sidepanel-beforetoggle");
            if ("ontransitionend"in window)
                this.$el.off(EVENT_SIDEPANEL_TRANSITIONEND).on(EVENT_SIDEPANEL_TRANSITIONEND, function() {
                    channel.trigger("cq-sidepanel-aftertoggle")
                });
            else
                setTimeout(function() {
                    channel.trigger("cq-sidepanel-aftertoggle")
                }, 2E3)
        },
        _triggerResized: function() {
            channel.trigger("cq-sidepanel-resized")
        },
        _handleWindowResizeBegin: function(event) {
            this.$el.addClass(CSS_SIDEPANEL_RESIZING);
            this._triggerResized()
        },
        _handleWindowResizeEnd: function(event) {
            this.$el.removeClass(CSS_SIDEPANEL_RESIZING);
            this._triggerResized()
        },
        _handleTabSwitch: function(event) {
            var headerTitle = Granite.I18n.getVar(event.tab.data("headertitle")) || "";
            this.$el.find("." + CSS_SIDEPANEL_HEADERTITLE).html(headerTitle)
        },
        _handleToggleClick: function(event) {
            if (this.$el.hasClass(CSS_SIDEPANEL_CLOSED))
                this.open(false);
            else
                this.close(false)
        },
        _handleTabNavClick: function(event) {
            this._triggerTabSwitched(event)
        },
        _getRelativeWidth: function(widthProperty) {
            var width = this.$el.css(widthProperty)
              , indexPx = width.indexOf("px");
            if (indexPx !== -1) {
                width = width.substring(0, width.length - 2);
                width = width / $(window).width() * 100
            } else
                width = parseFloat(width);
            return width
        },
        _cleanInlineCss: function() {
            this.$el.removeAttr("style");
            this.$anchor.removeAttr("style");
            this.$el.find("." + CSS_SIDEPANEL_RESIZER).removeAttr("style")
        },
        _handleResizeDragStart: function(event) {
            event.preventDefault();
            if (event.type === "mousedown") {
                if ((event.which || event.button) !== 1)
                    return;
                $("body").on("mousemove.cq-sidepanel-drag", this._handleResizeDrag.bind(this)).one("mouseup.cq-sidepanel-drag", this._handleResizeDragEnd.bind(this))
            } else
                $("body").on("touchmove.cq-sidepanel-drag pointermove.cq-sidepanel-drag MSPointerMove.cq-sidepanel-drag", this._handleResizeDrag.bind(this)).one("touchend.cq-sidepanel-drag pointerup.cq-sidepanel-drag MSPointerUp.cq-sidepanel-drag", this._handleResizeDragEnd.bind(this)).css("touch-action", "none")
        },
        _handleResizeDrag: function(event) {
            event.preventDefault();
            var inputPoint = event.originalEvent.touches ? event.originalEvent.touches[0] : event.originalEvent.changedTouches ? event.originalEvent.changedTouches[0] : event.originalEvent;
            var offset = inputPoint.pageX;
            var newWidth = offset / $(window).width() * 100;
            var minWidth = this._getRelativeWidth("minWidth");
            var maxWidth = this._getRelativeWidth("maxWidth");
            if (offset !== 0 && newWidth > minWidth && newWidth < maxWidth) {
                this._resizer.css("left", offset);
                this._resizer.addClass("is-dragging")
            }
        },
        _handleResizeDragEnd: function(event) {
            if (event.type === "mouseup")
                $("body").off("mousemove.cq-sidepanel-drag").off("mouseup.cq-sidepanel-drag");
            else
                $("body").off("touchmove.cq-sidepanel-drag pointermove.cq-sidepanel-drag MSPointerMove.cq-sidepanel-drag").off("touchend.cq-sidepanel-drag pointerup.cq-sidepanel-drag MSPointerUp.cq-sidepanel-drag").css("touch-action", "");
            var offset = this._resizer.css("left");
            if (offset !== "auto") {
                this.$anchor.css("left", offset);
                this.$el.css("width", offset);
                this._resizer.removeClass("is-dragging");
                this._resizer.removeAttr("style");
                channel.trigger("cq-sidepanel-resized")
            }
        },
        _addResizer: function() {
            this._resizer = $("\x3cdiv/\x3e").addClass(CSS_SIDEPANEL_RESIZER).on("touchstart.cq-sidepanel-drag pointerdown.cq-sidepanel-drag MSPointerDown.cq-sidepanel-drag", this._handleResizeDragStart.bind(this)).on("mousedown.cq-sidepanel-drag", this._handleResizeDragStart.bind(this)).appendTo(this.$el)
        },
        _setUserPrefCookie: function(value) {
            $.cookie(USER_PREF_COOKIE_KEY, value, {
                path: Granite.HTTP.externalize("/"),
                expires: 7
            })
        },
        _getUserPrefCookie: function() {
            return $.cookie(USER_PREF_COOKIE_KEY)
        },
        _showContentBackdrop: function() {
            if ($backdrop.length === 0)
                $backdrop = $('\x3cdiv class\x3d"cq-dialog-backdrop"\x3e\x3c/div\x3e').insertBefore(SIDEPANEL_SELECTOR);
            this.$el.addClass(DIALOG_OPENED_CLASS);
            $backdrop.show();
            $backdrop.addClass(DIALOG_BACKDROP_OPENED_CLASS)
        },
        _hideContentBackdrop: function() {
            var $sidePanel = this.$el;
            $backdrop.removeClass(DIALOG_BACKDROP_OPENED_CLASS);
            $backdrop.one("transitionend", function() {
                $backdrop.hide();
                $sidePanel.removeClass(DIALOG_OPENED_CLASS)
            })
        }
    };
    Object.defineProperty(ns, "SidePanel", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.ui.SidePanel instead");
            return ns.ui.SidePanel
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.ui.SidePanel instead");
            ns.ui.SidePanel = value
        }
    });
    channel.one("cq-editor-loaded", function() {
        ns.ui.SidePanel.init()
    });
    channel.ready(function() {
        var $panel = $(SIDEPANEL_SELECTOR);
        var url = $panel.data("contentUrl");
        $.ajax({
            url: url,
            success: function(res) {
                var $res = $(res);
                var $documentScripts = $(document).find("script");
                var presentSrcs = [];
                $documentScripts.each(function(i, v) {
                    if (v.getAttribute("src") !== null)
                        presentSrcs.push(v.getAttribute("src"))
                });
                var $scripts = $res.find("script");
                $scripts.each(function(i, v) {
                    var src = v.getAttribute("src");
                    if (src !== null && presentSrcs.indexOf(src) !== -1)
                        $(v).remove()
                });
                $panel.append($res);
                $panel.trigger("foundation-contentloaded");
                channel.trigger($.Event("cq-sidepanel-loaded"))
            }
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var emulatorElementsInitialized, emulatorBar, emulatorBarRuler, normalBar, rotatedBar, emulatorDeviceList, emulatorWidthLine, emulatorHeightLine;
    var liveAreaDelay = 100;
    var ariaLiveRegion = $("#ariaLiveRegion");
    var emulatorDeviceTrigger = ".js-EmulatorDeviceTrigger";
    var ariaPressedAttribute = "aria-pressed";
    function initEmulatorElements() {
        if (emulatorElementsInitialized)
            return;
        emulatorBar = $(".editor-EmulatorBar");
        if (!emulatorBar[0])
            return;
        emulatorElementsInitialized = true;
        emulatorBarRuler = $(".editor-EmulatorBar-ruler");
        normalBar = $(".editor-EmulatorBar-switcher--width");
        rotatedBar = $(".editor-EmulatorBar-switcher--height");
        emulatorDeviceList = document.querySelector(".js-editor-EmulatorDeviceList");
        $(".editor-EmulatorBar-switcher-device--desktop").attr("data-maxsize", "" + parseInt(window.innerWidth, 10));
        $(emulatorDeviceTrigger).attr(ariaPressedAttribute, "false");
        if (emulatorDeviceList)
            emulatorDeviceList.addEventListener("coral-selectlist:change", function(event) {
                if (!event || !event.target || !event.target.selectedItem)
                    return;
                var deviceName = event.target.selectedItem.value;
                _rewriteUrl(deviceName);
                if (deviceName === "native")
                    ns.ui.emulator.reset();
                else
                    ns.ui.emulator.applyDevice(deviceName, false)
            })
    }
    function updateDeviceList(device) {
        if (emulatorDeviceList) {
            var items = emulatorDeviceList.items.getAll();
            requestAnimationFrame(function() {
                for (var i = 0; i < items.length; i++)
                    items[i].selected = device === items[i].value
            })
        }
    }
    ns.ui.emulator = {
        deviceMap: null,
        currentDevice: null,
        currentDeviceGroup: null,
        currentDeviceGroups: null,
        defaultGroup: "responsive",
        currentConfig: null,
        breakpoints: null,
        isVisible: function() {
            return $(".editor-EmulatorBar").hasClass("is-visible")
        },
        toggle: function(condition) {
            var hasClass = $(".editor-EmulatorBar").toggleClass("is-visible", condition).hasClass("is-visible");
            if (hasClass) {
                this.updateEmulatorBar();
                $(window).on("resize.emulator-observe", $.throttle(50, this.updateEmulatorBar.bind(this)))
            } else
                $(window).off("resize.emulator-observe");
            channel.trigger("cq-emulatorbar-toggle", {
                isOpen: hasClass
            });
            ns.ContentFrame.resetContentHeight();
            ns.ContentFrame.updateTopOffset()
        },
        showWidthLine: function() {
            if (emulatorWidthLine)
                emulatorWidthLine.remove();
            emulatorWidthLine = $("\x3cdiv/\x3e", {
                "class": "js-editor-EmulatorBar-toolbar-currentWidth editor-EmulatorBar-toolbar-currentWidth"
            }).css({
                "left": this.currentConfig ? this.currentConfig.width : "100%"
            }).appendTo(emulatorBar.find(".editor-EmulatorBar-toolbar"))
        },
        showHeightLine: function() {
            if (emulatorHeightLine)
                emulatorHeightLine.remove();
            emulatorHeightLine = $("\x3cdiv/\x3e", {
                "class": "js-editor-EmulatorBar-toolbar-currentHeight editor-EmulatorBar-toolbar-currentHeight"
            }).css({
                "top": this.currentConfig ? this.currentConfig.height : 0,
                "width": this.currentConfig ? this.currentConfig.width : 0
            }).appendTo(emulatorBar.find(".editor-EmulatorBar-toolbar"))
        },
        resetBreakpoints: function() {
            var breakpoints = ns.pageInfo.responsive && ns.pageInfo.responsive.breakpoints ? ns.pageInfo.responsive.breakpoints : {}
              , barWidth = emulatorBar[0].clientWidth;
            emulatorBar.find(".js-editor-EmulatorBar-breakpoint").remove();
            for (var bp in breakpoints) {
                var isActive = bp === ns.responsive.getCurrentBreakpoint(), variant = isActive ? "info" : "inspect", outOfScreen = barWidth <= breakpoints[bp].width, placement = isActive && outOfScreen ? "left" : "top", my, at, tooltip;
                my = isActive && outOfScreen ? "right-5 bottom-6" : "center bottom-6";
                at = isActive && outOfScreen ? "left+" + barWidth + " bottom" : "left+" + breakpoints[bp].width + " bottom";
                tooltip = (new Coral.Tooltip).set({
                    variant: variant,
                    placement: placement,
                    content: {
                        innerHTML: Granite.I18n.getVar(breakpoints[bp].title) || bp
                    },
                    open: true
                });
                tooltip.classList.add("js-editor-EmulatorBar-breakpoint", "editor-EmulatorBar-breakpoint");
                $(tooltip).data("breakpoint", bp);
                $(tooltip).appendTo(emulatorBar).position({
                    my: my,
                    at: at,
                    of: emulatorBarRuler,
                    collision: "none"
                })
            }
        },
        showCurrentDeviceTooltip: function() {
            var deviceToolbar = emulatorBar.find(".editor-EmulatorBar-toolbar");
            emulatorBar.find(".js-editor-EmulatorBar-switcher-currentDevice").remove();
            if (this.currentConfig) {
                var tooltip = (new Coral.Tooltip).set({
                    variant: "inspect",
                    placement: "left",
                    content: {
                        innerHTML: ns.pageInfo.emulators.groups[this.currentDeviceGroup][this.currentDevice].text
                    },
                    open: true
                });
                tooltip.classList.add("js-editor-EmulatorBar-switcher-currentDevice", "editor-EmulatorBar-switcher-currentDevice");
                $(tooltip).appendTo(deviceToolbar).position({
                    my: "right-6 center",
                    at: "left+" + this.currentConfig.width,
                    of: deviceToolbar,
                    collision: "none"
                })
            }
        },
        updateEmulatorBar: function() {
            this.resetBreakpoints();
            this.showCurrentDeviceTooltip();
            this.showWidthLine();
            this.showHeightLine()
        },
        applyDevice: function(devicename, config) {
            var cfg = config || ns.ui.emulator.getDeviceByName(devicename), appliedCfg, self = this;
            if (cfg) {
                this.currentDevice = devicename;
                this.currentDeviceGroups = cfg.groups;
                this.currentDeviceGroup = cfg.groups[0];
                cfg.name = devicename;
                cfg.rotated = this.rotated;
                $.cookie("emulator", JSON.stringify({
                    rotated: this.rotated,
                    device: cfg
                }), {
                    path: Granite.HTTP.externalize("/"),
                    expires: 7
                });
                updateDeviceList(devicename);
                ns.overlayManager.setOverlaysVisible(false);
                ns.ContentFrame.executeCommand(null, "emulate", cfg).then(function(req, res) {
                    appliedCfg = res.data;
                    self.currentConfig = appliedCfg;
                    ns.ContentFrame.setWidth(appliedCfg.width);
                    ns.responsive.setDeviceBreakpoint(appliedCfg.width);
                    ns.ui.emulator.updateEmulatorBar();
                    setTimeout(function() {
                        ns.overlayManager.reposition(true);
                        ns.overlayManager.setOverlaysVisible(true);
                        ns.ContentFrame.resetContentHeight()
                    }, 500)
                })
            }
        },
        reset: function() {
            var self = this;
            $.removeCookie("emulator", {
                path: Granite.HTTP.externalize("/")
            });
            updateDeviceList("native");
            ns.ContentFrame.setWidth("");
            ns.ContentFrame.executeCommand(null, "resetEmulate").then(function() {
                self.currentConfig = null;
                self.currentDevice = null;
                self.currentDeviceGroups = null;
                ns.ContentFrame.resetContentHeight();
                ns.responsive.setDeviceBreakpoint();
                ns.ui.emulator.updateEmulatorBar()
            })
        },
        initDevices: function() {
            var devices = [];
            if (emulatorDeviceList && (ns.pageInfo && ns.pageInfo.emulators && ns.pageInfo.emulators.groups)) {
                var items = emulatorDeviceList.items.getAll();
                for (var i = 0; i < items.length; i++) {
                    var devicename = items[i].value;
                    if (devicename === "native")
                        continue;
                    var devicegroups = [];
                    for (var group in ns.pageInfo.emulators.groups)
                        if (ns.pageInfo.emulators.groups[group][devicename])
                            devicegroups.push(group);
                    if (devicegroups.length) {
                        var device = ns.pageInfo.emulators.groups[devicegroups[0]][devicename];
                        device.name = devicename;
                        device.groups = devicegroups;
                        devices.push(device)
                    }
                }
            }
            return devices
        },
        getDeviceByName: function(devicename) {
            return this.deviceMap.find(_findByDevice(devicename))
        },
        getDeviceByGroup: function(devicegroups) {
            return this.deviceMap.find(_findByGroups(devicegroups))
        },
        getDeviceConfig: function() {
            var groupsFromSelector = _getGroupsFromSelector();
            var cfg = JSON.parse($.cookie("emulator"));
            if (!groupsFromSelector.length)
                if (cfg)
                    return cfg;
                else
                    return null;
            else if (cfg && _deviceHasGroup(groupsFromSelector, cfg.device))
                return cfg;
            else {
                cfg = null;
                var device = ns.ui.emulator.getDeviceByGroup(groupsFromSelector);
                if (device) {
                    cfg = {};
                    cfg.device = device
                }
                return cfg
            }
        }
    };
    Object.defineProperty(ns.ui.emulator, "rotated", {
        set: function(val) {
            var button = $(".editor-EmulatorDeviceRotate")[0];
            this._rotated = !!val;
            $(".js-EmulatorDeviceRotate").attr("aria-label", Granite.I18n.get("Rotate device", "aria-label for accesibillity fix") + " to " + (!this._rotated ? Granite.I18n.get("landscape") : Granite.I18n.get("portrait")));
            if (this._rotated) {
                button.icon = "deviceRotateLandscape";
                rotatedBar.addClass("is-visible");
                normalBar.removeClass("is-visible")
            } else {
                button.icon = "deviceRotatePortrait";
                normalBar.addClass("is-visible");
                rotatedBar.removeClass("is-visible")
            }
        },
        get: function() {
            return !!this._rotated
        }
    });
    function _rewriteUrl(devicename) {
        var selectorInURL = _getSelectorFromURL();
        var path = Granite.HTTP.getPath(window.location.href);
        var extension = window.location.pathname.substring(window.location.pathname.lastIndexOf(".") + 1);
        var selectorForDevice = devicename === "native" ? "" : _getSelectorForDevice(ns.ui.emulator.getDeviceByName(devicename));
        if (selectorInURL != selectorForDevice) {
            if (selectorForDevice.length)
                selectorForDevice = "." + selectorForDevice;
            var url = path + selectorForDevice + "." + extension + window.location.hash + window.location.search;
            History.pushState(null, null, Granite.HTTP.externalize(url))
        }
    }
    function _findByDevice(devicename) {
        return function(device) {
            return device.name === devicename
        }
    }
    function _findByGroups(groups) {
        return function(device) {
            if (!groups.length)
                return false;
            for (var i = 0; i < groups.length; i++)
                if (!device.groups.includes(groups[i]))
                    return false;
            return true
        }
    }
    function _getSelectorFromURL() {
        var path = Granite.HTTP.getPath(window.location.href);
        var selector = window.location.pathname.substring(path.length);
        var start = selector.indexOf(".");
        var end = selector.lastIndexOf(".");
        if (start > -1 && end > start)
            selector = selector.substring(start + 1, end);
        else
            selector = "";
        return selector
    }
    function _getSelectorForDevice(device) {
        var devicegroups = [];
        for (var i = 0; i < device.groups.length; i++) {
            var group = device.groups[i];
            if (group !== ns.ui.emulator.defaultGroup)
                devicegroups.push(group)
        }
        return devicegroups.join(".")
    }
    function _getGroupsFromSelector() {
        var groups = [];
        var selectorInURL = _getSelectorFromURL();
        if (selectorInURL.length)
            groups = selectorInURL.split(".");
        return groups
    }
    function _deviceHasGroup(groups, device) {
        var devicegroups = device.groups || [ns.ui.emulator.defaultGroup];
        return devicegroups.some(function(devicegroup) {
            return groups.includes(devicegroup)
        })
    }
    channel.on("cq-editor-loaded", function() {
        try {
            initEmulatorElements();
            ns.ui.emulator.deviceMap = ns.ui.emulator.initDevices();
            if (ns.ui.emulator.deviceMap.length) {
                var cfg = ns.ui.emulator.getDeviceConfig();
                if (cfg) {
                    ns.ui.emulator.rotated = cfg.rotated;
                    ns.ui.emulator.applyDevice(cfg.device.name);
                    updateDeviceList(cfg.device.name)
                }
                ns.ui.globalBar.emulatorTrigger.disabled = false
            }
        } catch (ex) {}
    });
    $(document).on("click", ".js-editor-EmulatorBar-toggle", ns.ui.emulator.toggle.bind(ns.ui.emulator));
    $(document).on("click", ".js-editor-LayerSwitcherTrigger", function() {
        ariaLiveRegion.html("");
        setTimeout(function() {
            ariaLiveRegion.html(Granite.I18n.get("Preview button pressed", "label used in accesibility to annouce preview button state") + " ")
        }, liveAreaDelay)
    });
    $(document).on("click", ".js-editor-EmulatorBar-toggle", function() {
        ariaLiveRegion.html("");
        setTimeout(function() {
            ariaLiveRegion.html(Granite.I18n.get("Devices emulator button pressed", "label used in accesibility to annouce emulator button state") + " ")
        }, liveAreaDelay)
    });
    $(document).on("click", ".js-EmulatorDeviceRotate", function(ev) {
        ns.ui.emulator.rotated = !ns.ui.emulator.rotated;
        if (ns.ui.emulator.currentDevice)
            ns.ui.emulator.applyDevice(ns.ui.emulator.currentDevice);
        setTimeout(function() {
            $("#ariaLiveRegion").html(Granite.I18n.get("device viewport changed to", "label used in accesibility to annouce viewport change") + " " + (ns.ui.emulator.rotated ? Granite.I18n.get("landscape") : Granite.I18n.get("portrait")))
        }, liveAreaDelay)
    });
    $(document).on("click", emulatorDeviceTrigger, function(ev) {
        var devicename = $(ev.currentTarget).data("device");
        var deciveSize = $(ev.currentTarget).attr("data-maxsize");
        setTimeout(function() {
            $("#ariaLiveRegion").html(Granite.I18n.get("device viewport changed from 0px to", "label used in accesibility to annouce dimension of viewport") + " " + deciveSize + Granite.I18n.get("px", "label used in accesibility for px"))
        }, liveAreaDelay);
        if ($(emulatorDeviceTrigger).attr(ariaPressedAttribute) !== true)
            $(emulatorDeviceTrigger).attr(ariaPressedAttribute, "false");
        $(ev.currentTarget).attr(ariaPressedAttribute, "true");
        _rewriteUrl(devicename);
        ns.ui.emulator[devicename === "native" ? "reset" : "applyDevice"](devicename)
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.StatusBar = ns.util.createClass({
        rootPath: null,
        statusType: "",
        nextId: 0,
        counter: 0,
        statuses: {},
        ids: [],
        currentStatus: -1,
        loaded: false,
        constructor: function() {
            this.$dom = $(".editor-StatusBar");
            this.$navigation = this.$dom.find(".js-editor-StatusBar-navigation");
            this.$badge = this.$dom.find(".js-editor-StatusBar-badge");
            this.$popover = this.$dom.find(".js-editor-StatusBar-popover");
            this.$statusList = this.$dom.find(".js-editor-StatusBar-statusList");
            this.status = this.$dom.find(".js-editor-StatusBar-status").get(0);
            Coral.commons.ready(this.status, function() {
                this.icon = $(this.status).find("coral-icon").get(0)
            }
            .bind(this));
            this.rootPath = this.$dom.attr("data-rootPath");
            this.statusType = this.$dom.attr("data-statusType") || "";
            channel.on("click", ".js-editor-StatusBar-previous", this.showPreviousStatus.bind(this));
            channel.on("click", ".js-editor-StatusBar-next", this.showNextStatus.bind(this))
        },
        _reset: function() {
            this.nextId = 0;
            this.counter = 0;
            this.statuses = {};
            this.ids = [];
            this.currentStatus = -1;
            this.$statusList.empty();
            this.loaded = false
        },
        _translate: function(status, key) {
            var value = status[key] || null;
            if (value instanceof Array)
                return $.map(value, function(value, i) {
                    return Granite.I18n.get(value, status["i18n." + key + "." + i + ".snippets"], status["i18n." + key + "." + i + ".comment"])
                });
            return Granite.I18n.get(value, status["i18n." + key + ".snippets"], status["i18n." + key + ".comment"])
        },
        _addStatus: function(status) {
            var defaults = {
                success: {
                    priority: 0,
                    icon: "checkCircle"
                },
                info: {
                    priority: 1E4,
                    icon: "infoCircle"
                },
                warning: {
                    priority: 2E4,
                    icon: "alert"
                },
                error: {
                    priority: 3E4,
                    icon: "alert"
                }
            };
            $.extend(status, {
                statusPriority: status.statusPriority == null ? defaults[status.variant].priority : status.statusPriority,
                icon: status.icon || defaults[status.variant].icon
            });
            var id = this.nextId++;
            this.statuses[id] = status;
            this.counter++;
            for (var index = 0; index < this.ids.length; index++)
                if (status.statusPriority >= this.statuses[this.ids[index]].statusPriority)
                    break;
            this.ids.splice(index, 0, id);
            if (this.currentStatus >= index)
                this.currentStatus++;
            var title = this._translate(status, "title");
            var shortMessage = this._translate(status, "shortMessage");
            var $content = $("\x3cdiv/\x3e");
            $content.append($("\x3cspan/\x3e").addClass("editor-StatusBar-listItemTitle").text(title));
            $content.append($("\x3cspan/\x3e").addClass("editor-StatusBar-listItemText").html(shortMessage));
            var $anchor = $('\x3ca is\x3d"coral-anchorlist-item" icon\x3d"' + status.icon + '" data-id\x3d"' + id + '"\x3e' + $content.html() + "\x3c/a\x3e");
            $anchor.click(function() {
                this.showStatus(id)
            }
            .bind(this));
            if (this.$statusList.children().length == 0 || index == 0)
                this.$statusList.prepend($anchor);
            else
                this.$statusList.children().eq(index - 1).after($anchor);
            if (this.currentStatus < 0)
                this.currentStatus = 0;
            return id
        },
        _render: function() {
            if (this.currentStatus < 0)
                return;
            var id = this.ids[this.currentStatus];
            var status = this.statuses[id];
            var title = this._translate(status, "title");
            this.status.header.innerHTML = title;
            var message = $("\x3cspan/\x3e").addClass("editor-StatusBar-message").html(this._translate(status, "message"));
            var $content = $("\x3cspan/\x3e").html(message);
            if (status.actionIds && status.actionLabels) {
                var actionLabels = this._translate(status, "actionLabels");
                for (var i = 0; i < status.actionIds.length; i++) {
                    var $a = $('\x3ca href\x3d"#"/\x3e').addClass("coral-Link coral-Link--subtle editor-StatusBar-action").attr("data-status-type", status.statusType).attr("data-status-id", id).attr("data-status-action-id", status.actionIds[i]).data("statusData", status).text(actionLabels[i]);
                    $content.append($a)
                }
            }
            $(this.status.content).html($content);
            this.status.variant = status.variant;
            if (this.icon)
                this.icon.icon = status.icon;
            this.$badge.text(this.counter);
            this.$navigation.toggle(this.counter > 1);
            if (this.counter < 2)
                this.$popover.hide()
        },
        show: function() {
            this._render();
            this.$dom.show();
            ns.ContentFrame.resetContentHeight();
            ns.ContentFrame.updateTopOffset()
        },
        hide: function() {
            this.$dom.hide();
            ns.ContentFrame.resetContentHeight();
            ns.ContentFrame.updateTopOffset()
        },
        loadStatuses: function(path) {
            this._reset();
            var url = Granite.HTTP.externalize(this.rootPath + "/" + (this.statusType || "") + path + ".1.json");
            $.get(url, function(data) {
                if (data && data["0"]) {
                    for (var i = 0; data[i] !== undefined; i++)
                        this._addStatus(data[i]);
                    this.showStatus(0)
                }
                this.loaded = true;
                channel.trigger("cq-editor-statusbar-loaded")
            }
            .bind(this))
        },
        hasLoaded: function() {
            return this.loaded
        },
        addStatus: function(type, title, message, shortMessage, priority, variant, icon, data, actions) {
            var status = $.extend({}, data, {
                statusType: type,
                statusPriority: priority,
                title: title,
                message: message,
                shortMessage: shortMessage,
                variant: variant || "info",
                icon: icon,
                actionIds: actions ? actions.map(function(action) {
                    return action.id
                }) : null,
                actionLabels: actions ? actions.map(function(action) {
                    return action.label
                }) : null
            });
            var id = this._addStatus(status);
            this._render();
            if (!this.$dom.is(":visible"))
                this.show();
            return id
        },
        removeStatus: function(id) {
            var index = this.ids.indexOf(id);
            if (index < 0)
                return;
            this.counter--;
            delete this.statuses[id];
            this.ids.splice(index, 1);
            this.$statusList.find("a[data-id\x3d" + id + "]").remove();
            if (index <= this.currentStatus)
                this.currentStatus--;
            if (this.currentStatus < 0 && this.counter > 0)
                this.currentStatus = 0;
            this.currentStatus < 0 ? this.hide() : this._render()
        },
        showStatus: function(id) {
            var index = this.ids.indexOf(id);
            if (index < 0)
                return;
            this.currentStatus = index;
            this._render();
            if (!this.$dom.is(":visible"))
                this.show()
        },
        showPreviousStatus: function() {
            this.currentStatus--;
            if (this.currentStatus < 0)
                this.currentStatus = this.counter - 1;
            this._render()
        },
        showNextStatus: function() {
            this.currentStatus++;
            if (this.currentStatus >= this.counter)
                this.currentStatus = 0;
            this._render()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var statusBar = null;
    ns.ui.statusBarManager = {
        init: function() {
            if (!$(".editor-StatusBar").length)
                return;
            statusBar = new ns.ui.StatusBar;
            this.updateStatusBar();
            channel.on("cq-editor-loaded", function() {
                this.updateStatusBar()
            }
            .bind(this))
        },
        getStatusBar: function() {
            return statusBar
        },
        updateStatusBar: function() {
            var path = Granite.HTTP.internalize(ns.getPageInfoLocation());
            statusBar.loadStatuses(path);
            var $cf = $(ns.ContentFrame.contentWindow);
            $cf.off("unload.cq-editor-statusbar").on("unload.cq-editor-statusbar", function() {
                this.hideStatusBar()
            }
            .bind(this))
        },
        hideStatusBar: function() {
            statusBar.hide()
        }
    };
    channel.one("cq-editor-loaded", function() {
        ns.ui.statusBarManager.init()
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, document, undefined) {
    var NS = ".editor-styleselector";
    var PN_STYLE_IDS = "./cq:styleIds";
    var ui = $(window).adaptTo("foundation-ui");
    var keyCodes = {
        ENTER: 13,
        ESCAPE: 27
    };
    var attrs = {
        GROUP_MULTIPLE: "data-editor-styleselector-group-multiple",
        ID_INPUT: "data-editor-styleselector-id-input"
    };
    var selectors = {
        SELF: ".editor-StyleSelector",
        CONTROL: '[data-editor-styleselector-control\x3d"true"]',
        POPOVER: "[data-editor-styleselector-popover]",
        FORM: "[data-editor-styleselector-form]",
        SELECTLIST: "[data-editor-styleselector-selectlist]",
        ID_INPUT: "[" + attrs.ID_INPUT + '\x3d"true"]',
        CANCEL: "[data-editor-styleselector-cancel]"
    };
    var type = {
        COMPONENT: "component",
        PAGE: "page"
    };
    function StyleSelector(config) {
        this._onKeydownBound = this._onKeydown.bind(this);
        this._reloading = false;
        this._initialStyleIdValues = [];
        this._el = config.el;
        this._type = this._el.dataset.editorStyleselectorType;
        this._cacheElements();
        this._bindEvents()
    }
    StyleSelector.prototype._cacheElements = function() {
        this._popover = this._el;
        this._form = this._el.querySelector(selectors.FORM);
        this._selectList = this._el.querySelector(selectors.SELECTLIST);
        this._idInputs = this._el.querySelectorAll(selectors.ID_INPUT);
        this._cancel = this._el.querySelector(selectors.CANCEL)
    }
    ;
    StyleSelector.prototype._reload = function(path, resourceType) {
        var self = this;
        if (self._reloading || !self._popover)
            return;
        if (!path)
            path = self._form.dataset.editorStyleselectorItemId;
        self._reloading = true;
        var request = new XMLHttpRequest;
        var url = Granite.HTTP.getContextPath() + Granite.URITemplate.expand(self._popover.dataset.editorStyleselectorSrcUritemplate, {
            item: path,
            resourceType: resourceType,
            selector: "form"
        });
        ui.wait(self._popover);
        request.open("GET", url + "\x26:ck\x3d" + (new Date).getTime(), true);
        request.onload = function() {
            function loadEnd() {
                ui.clearWait();
                self._reloading = false
            }
            if (request.status >= 200 && request.status < 400) {
                var data = request.responseText;
                var el = $(data)[0];
                self._form.parentNode.replaceChild(el, self._form);
                self._cacheElements();
                self._bindEvents();
                loadEnd()
            } else
                loadEnd()
        }
        ;
        request.send()
    }
    ;
    StyleSelector.prototype._cancelSelection = function() {
        var self = this;
        self._updateHiddenIdInputs(self._initialStyleIdValues);
        channel.one("foundation-form-submitted" + NS + ".cancel", self._form, function(event, success, xhr) {
            if (success)
                self._reload()
        });
        window.setTimeout(function() {
            $(self._form).submit()
        }, Coral.mixin.overlay.FADETIME);
        self._popover.open = false
    }
    ;
    StyleSelector.prototype._updateHiddenIdInputs = function(values) {
        var self = this;
        Array.prototype.forEach.call(self._idInputs, function(node) {
            if (values.indexOf(node.value) === -1)
                node.parentNode.removeChild(node)
        });
        for (var i = 0; i < values.length; i++) {
            var value = values[i];
            var element = document.querySelector(selectors.ID_INPUT + '[value\x3d"' + value + '"]');
            if (!element) {
                var input = document.createElement("input");
                input.setAttribute("type", "hidden");
                input.setAttribute("name", PN_STYLE_IDS);
                input.setAttribute("value", values[i]);
                input.setAttribute(attrs.ID_INPUT, true);
                self._form.appendChild(input)
            }
        }
        self._idInputs = self._el.querySelectorAll(selectors.ID_INPUT)
    }
    ;
    StyleSelector.prototype._bindEvents = function() {
        var self = this;
        self._popover.removeEventListener("keydown", self._onKeydownBound);
        self._popover.addEventListener("keydown", self._onKeydownBound, true);
        $(self._popover).off("coral-overlay:beforeopen" + NS).on("coral-overlay:beforeopen" + NS, function() {
            self._initialStyleIdValues = Array.prototype.map.call(self._idInputs, function(item) {
                return item.value
            })
        });
        $(self._selectList).off("coral-selectlist:change" + NS).on("coral-selectlist:change" + NS, function(event) {
            var oldSelection = event.detail.oldSelection;
            var selection = event.detail.selection;
            var selectionValues = event.detail.selection.map(function(item) {
                return item.value
            });
            var submit = false;
            self._updateHiddenIdInputs(selectionValues);
            if (oldSelection && selection)
                if (selection.length > oldSelection.length) {
                    var diff = selection.filter(function(item) {
                        return oldSelection.indexOf(item) === -1
                    });
                    if (diff.length > 0) {
                        var newlySelectedItem = diff[0];
                        var parentNode = newlySelectedItem.parentNode;
                        if (parentNode.tagName.toLowerCase() === "coral-selectlist-group")
                            if (!parentNode.hasAttribute(attrs.GROUP_MULTIPLE)) {
                                var groupSelectedItems = parentNode.querySelectorAll("[selected]");
                                if (groupSelectedItems.length > 1)
                                    toggleDeselectAll(parentNode.items.getAll(), false, newlySelectedItem);
                                else
                                    submit = true
                            } else
                                submit = true
                    }
                } else
                    submit = true;
            if (submit)
                $(self._form).submit()
        });
        $(self._cancel).off("click" + NS).on("click" + NS, function() {
            self._cancelSelection.call(self)
        });
        $(self._form).off("foundation-form-submitted" + NS).on("foundation-form-submitted" + NS, function(event, success, xhr) {
            if (success)
                if (self._type === type.PAGE)
                    ns.ContentFrame.reload(true);
                else {
                    var path = self._form.dataset.editorStyleselectorItemId;
                    var editables = ns.editables.find(path);
                    var editable = editables.length > 0 ? editables[0] : undefined;
                    if (editable) {
                        var stillActive = ns.selection.active && ns.selection.active.path === editable.path;
                        $(document).off("cq-overlays-repositioned" + NS).on("cq-overlays-repositioned" + NS, function() {
                            if (!editable.overlay || !editable.overlay.dom)
                                self._popover.open = false;
                            else
                                self._popover.reposition()
                        });
                        editable.refresh().then(function() {
                            editable.afterEdit();
                            var editableParent = ns.editables.getParent(editable);
                            editableParent && editableParent.afterChildEdit(editable);
                            if (stillActive) {
                                ns.selection.select(editable);
                                ns.selection.activate(editable)
                            }
                        });
                        if (ns.selection.active && ns.selection.active.path !== editable.path)
                            self._reload(ns.selection.active.path, ns.selection.active.type)
                    }
                }
        });
        if (self._type === type.COMPONENT)
            channel.off("cq-interaction-focus" + NS).on("cq-interaction-focus" + NS, function(event) {
                var editable = event.editable;
                if (editable && !editable.isNewSection())
                    self._reload(editable.path, editable.type)
            });
        if (self._type === type.PAGE)
            channel.on("cq-layer-activated", function(event) {
                if (event.layer === "initial" && event.layer !== event.prevLayer) {
                    var path = self._form.dataset.editorStyleselectorItemId;
                    path = ns.getTemplateAspectUrl(path, event.layer);
                    self._reload(path)
                }
            })
    }
    ;
    StyleSelector.prototype._onKeydown = function(event) {
        var self = this;
        switch (event.keyCode) {
        case keyCodes.ENTER:
            self._popover.open = false;
            break;
        case keyCodes.ESCAPE:
            self._cancelSelection();
            break;
        default:
            return
        }
    }
    ;
    function toggleDeselectAll(items, select, ignore) {
        items.filter(function(item) {
            return select === true ? !item.selected : item.selected
        }).forEach(function(el) {
            if (el !== ignore)
                Coral.commons.nextFrame(function() {
                    el.selected = select === true
                })
        })
    }
    channel.one("cq-editor-loaded" + NS, function() {
        var styleSelector = document.querySelectorAll(selectors.SELF);
        for (var i = 0; i < styleSelector.length; i++)
            new StyleSelector({
                el: styleSelector[i]
            })
    })
}
)(jQuery, Granite.author, jQuery(document), this, document);
(function(ns, channel, window, undefined) {
    ns.errors = function() {
        var self = {}
          , isConsoleAvailable = typeof console !== "undefined";
        self.allowUserNotifications = true;
        channel.on("error", function(event) {
            if (isConsoleAvailable)
                console.error(event.message, "-\x3e", event.exception ? event.exception.stack : "");
            if (self.allowUserNotifications)
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("An error occurred, please check the browser console for more details."),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                })
        });
        return self
    }()
}
)(Granite.author, jQuery(document), this);
(function($, ns, channel, window, document, undefined) {
    function isDialogFullscreen($dialog) {
        var isFullscreen = $dialog.attr("fullscreen");
        return typeof isFullscreen !== "undefined" && isFullscreen !== false
    }
    function transformTo($dialog, floating) {
        var $dialogContent = $dialog.find(".cq-dialog-content");
        if (floating) {
            var height = $dialog.data("cq-dialog-height");
            $dialogContent.height(height || "");
            var width = $dialog.data("cq-dialog-width");
            $dialogContent.width(width || "");
            $dialog.attr("fullscreen", null);
            $dialog.attr("movable", true);
            $dialog.addClass("cq-dialog-floating");
            $dialog.trigger("dialog-layouttoggle-floating")
        } else {
            $dialogContent.height("");
            $dialogContent.width("");
            $dialog.attr("movable", null);
            $dialog.attr("fullscreen", true);
            $dialog.removeClass("cq-dialog-floating");
            $dialog.trigger("dialog-layouttoggle-fullscreen")
        }
    }
    var loader = {
        inline: function(src, currentDialog) {
            ns.ui.helpers.wait();
            return $.ajax({
                url: src,
                type: "get",
                data: currentDialog.getRequestData()
            }).always(function() {
                ns.ui.helpers.clearWait()
            }).done(function(html) {
                $(document.body).append(html)
            })
        },
        newpage: function(src, currentDialog) {
            var defaultConfig = {
                page: true
            };
            var param = $.param($.extend({}, defaultConfig, currentDialog.getRequestData()));
            if (param && param.length > 0)
                src += src.indexOf("?") < 0 ? "?" : "\x26";
            window.location = src + param
        },
        auto: function(src, currentDialog) {
            if (!ns.device.isDesktop() || ns.device.isIpad) {
                this.newpage(src, currentDialog);
                return
            }
            ns.history.Manager.setBlocked(true);
            ns.ui.helpers.wait();
            return $.ajax({
                url: src,
                type: "get",
                data: currentDialog.getRequestData()
            }).then(function(html) {
                var parser = $(window).adaptTo("foundation-util-htmlparser");
                parser.parse(html, true).then(function(dialogHtml) {
                    var $form = $(dialogHtml.querySelector("form.cq-dialog"));
                    var $dialog = $form.closest("coral-dialog");
                    var cfg = currentDialog.getConfig();
                    if ("fullscreen" === cfg.layout)
                        $dialog.attr("fullscreen", "");
                    $dialog.appendTo(document.body);
                    $dialog.attr("open", true);
                    $form.removeAttr("data-cq-dialog-returntoreferral");
                    if (cfg.fullscreenToggle !== false) {
                        var $toggleLayoutButton = $('\x3cbutton is\x3d"coral-button" icon\x3d"fullScreen" variant\x3d"minimal" ' + 'class\x3d"cq-dialog-header-action cq-dialog-layouttoggle" aria-pressed\x3d"false" ' + ('type\x3d"button" title\x3d"' + Granite.I18n.get("Toggle Fullscreen") + '"\x3e') + "\x3c/button\x3e");
                        $toggleLayoutButton.insertAfter($dialog.find(".cq-dialog-help")).on("click", function() {
                            transformTo($dialog, isDialogFullscreen($dialog));
                            $(this).attr("aria-pressed", isDialogFullscreen($dialog))
                        })
                    }
                    var floating = cfg.layout === "auto" || cfg.layout === "floating";
                    transformTo($dialog, floating);
                    ns.DialogFrame.currentFloatingDialog = $dialog;
                    $dialog.trigger("cui-contentloaded");
                    channel.trigger("dialog-ready")
                })
            }).always(function() {
                return ns.ui.helpers.clearWait()
            })
        }
    };
    ns.DialogFrame = function() {
        var self = {};
        self.currentDialog = null;
        self.currentFloatingDialog = null;
        self.loader = loader;
        self.dialogMode = null;
        function handleDragStart() {
            if (!self.currentFloatingDialog)
                return
        }
        function handleResize() {
            if (!self.currentFloatingDialog)
                return
        }
        function handleDialogReady() {
            if (!self.isOpened())
                return;
            ns.ui.helpers.clearWait();
            execute("onReady")
        }
        function handleDialogSuccess() {
            if (!self.isOpened())
                return;
            execute("onSuccess")
        }
        function handleDialogClosed() {
            if (!self.isOpened())
                return;
            execute("onClose");
            self.closeDialog()
        }
        function handleDialogFocused() {
            if (!self.isOpened())
                return;
            execute("onFocus")
        }
        function execute(listener) {
            if (self.currentDialog[listener])
                self.currentDialog[listener](self.currentDialog, self.currentFloatingDialog)
        }
        function bindEvents() {
            channel.on("mousedown.dialogframe", ".cq-dialog-floating .cq-dialog-header", handleDragStart);
            channel.on("cq-sidepanel-resized.dialogframe", handleResize);
            channel.on("dialog-ready.dialogframe", handleDialogReady);
            channel.on("dialog-success.dialogframe", handleDialogSuccess);
            channel.on("dialog-closed.dialogframe", handleDialogClosed);
            channel.on("focus.dialogframe", ".cq-dialog", handleDialogFocused);
            channel.on("resize.dialog", $.debounce(500, false, handleResize))
        }
        function unbindEvents() {
            channel.off("mousedown.dialogframe").off("cq-sidepanel-resized.dialogframe").off("dialog-ready.dialogframe").off("dialog-success.dialogframe").off("dialog-closed.dialogframe").off("resize.dialog").off("focus.dialogframe")
        }
        self.openDialog = function(dialog) {
            var cfg = dialog.getConfig()
              , loadingMode = this.dialogMode || cfg.loadingMode;
            if (self.isOpened())
                return;
            if (!loader.hasOwnProperty(loadingMode))
                return;
            this.currentDialog = dialog;
            loader[loadingMode](cfg.src, dialog);
            bindEvents();
            execute("onOpen")
        }
        ;
        self.closeDialog = function() {
            if (!self.isOpened())
                return;
            ns.ui.helpers.clearWait();
            if (self.currentFloatingDialog)
                self.currentFloatingDialog.remove();
            this.currentFloatingDialog = null;
            this.currentDialog = null;
            unbindEvents()
        }
        ;
        self.isOpened = function() {
            return !!this.currentDialog
        }
        ;
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this, document);
(function($, channel, window, undefined) {
    channel.on("cq-asset-dropped", function(e) {
        try {
            var params = {};
            params[":applyTo"] = [e.path];
            params[":operation"] = "add-asset-usage-record";
            params["usage-type"] = "aem";
            $.ajax({
                type: "POST",
                url: Granite.HTTP.externalize("/content/dam"),
                data: params
            })
        } catch (err) {}
    })
}
)(jQuery, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var LAYER_NAMESPACE = "cq-editor-layer";
    var AUTHOR_LAYER_CSSCLASS_PREFIX = "aem-AuthorLayer-";
    ns.LayerManager = function(config) {
        var self = this;
        this._currentLayer = undefined;
        this._layers = {};
        this._layerOrder = [];
        this.config = $.extend(true, {}, config);
        if (this.config.layerOrder && $.isArray(this.config.layerOrder))
            this._layerOrder = this.config.layerOrder;
        channel.on("cq-editor-loaded", function() {
            self.init()
        });
        channel.on("click", ".js-editor-LayerSwitcherTrigger", function(event) {
            var name = $(event.currentTarget).attr("data-layer");
            if (self._currentLayer && name !== self._currentLayer.name)
                self.loadLayer(name)
        })
    }
    ;
    ns.LayerManager.prototype = {
        constructor: ns.LayerManager,
        getLayers: function() {
            return this._layers
        },
        getCurrentLayerName: function() {
            if (this._currentLayer)
                return this._currentLayer.name;
            var layerName = ns.preferences.cookie.get(LAYER_NAMESPACE);
            if (layerName && this._layers[layerName] && this._layers[layerName].isAvailable())
                return layerName;
            return null
        },
        getCurrentLayer: function() {
            Granite.author.util.deprecated("Use Granite.author.layerManager.getCurrentLayerName instead");
            return this.getCurrentLayerName()
        },
        setCurrentLayer: function(layerName) {
            var prevLayer = this.getCurrentLayerName();
            this._currentLayer = this._layers[layerName];
            ns.ContentFrame.executeCommand(null, "toggleClass", {
                className: AUTHOR_LAYER_CSSCLASS_PREFIX + prevLayer,
                condition: false
            });
            ns.ContentFrame.executeCommand(null, "toggleClass", {
                className: AUTHOR_LAYER_CSSCLASS_PREFIX + layerName,
                condition: true
            });
            ns.preferences.cookie.set(LAYER_NAMESPACE, layerName)
        },
        registerLayer: function(layer, position) {
            if ($.inArray(layer.name, this._layerOrder) < 0)
                if ($.isNumeric(position) && position >= 0 && position < this._layerOrder.length)
                    this._layerOrder.splice(position, 0, layer.name);
                else
                    this._layerOrder.push(layer.name);
            this._layers[layer.name] = layer
        },
        updateLayerSelector: function() {
            var self = this;
            var layer;
            var name;
            ns.ui.globalBar.layerSwitcher.empty();
            this._layerOrder.map(function(name) {
                layer = self._layers[name];
                if (layer && !layer.hidden && layer.isAvailable())
                    ns.ui.globalBar.layerSwitcher.addLayer(layer)
            });
            for (name in self._layers)
                if (self._layers.hasOwnProperty(name))
                    if (self._layerOrder.indexOf(name) === -1) {
                        layer = self._layers[name];
                        if (layer.isAvailable() && !layer.hidden)
                            ns.ui.globalBar.layerSwitcher.addLayer(layer)
                    }
        },
        getDefaultLayer: function() {
            return this._layerOrder && this._layerOrder.length > 0 ? this._layerOrder[0] : undefined
        },
        init: function() {
            var layerName;
            this.updateLayerSelector();
            layerName = this.getCurrentLayerName() || this.getDefaultLayer.apply(this, arguments);
            if (layerName)
                this.activateLayer(layerName)
        },
        loadLayer: function(name) {
            this.activateLayer(name)
        },
        activateLayer: function(name) {
            if (!name || typeof name != "string" || name.length < 1)
                return;
            var prevLayerName = this.getCurrentLayerName();
            var layer = this._layers[name];
            if (layer && layer.isAvailable()) {
                if (this._currentLayer)
                    this._currentLayer.deactivate();
                this.setCurrentLayer(name);
                layer.activate();
                channel.trigger($.Event("cq-layer-activated", {
                    layer: name,
                    prevLayer: prevLayerName
                }))
            }
        },
        focus: function() {
            if ($("#FullScreenWrapper").length > 0)
                return;
            $(".js-editor-GlobalBar-layerCurrent").focus()
        },
        toggle: function() {
            var $previewTrigger = $(".js-editor-GlobalBar-previewTrigger");
            var $trigger = $(".js-editor-GlobalBar-layerCurrent");
            var focusPreviewTrigger = true;
            if ($("#FullScreenWrapper").length > 0)
                return;
            var name = $previewTrigger.data("layer");
            if (this._currentLayer && this._currentLayer.name === name) {
                focusPreviewTrigger = false;
                name = $trigger.attr("data-layer");
                var contentWindow = ns.ContentFrame.contentWindow;
                if (contentWindow.getSelection)
                    if (contentWindow.getSelection().empty)
                        contentWindow.getSelection().empty();
                    else {
                        if (contentWindow.getSelection().removeAllRanges)
                            contentWindow.getSelection().removeAllRanges()
                    }
                else if (ns.ContentFrame.getDocument().selection)
                    ns.ContentFrame.getDocument().selection.empty()
            }
            this.loadLayer(name);
            if (focusPreviewTrigger)
                $previewTrigger.focus();
            else
                $trigger.focus()
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function init(context, config) {
        context.name = config.name;
        context.icon = config.icon;
        context.title = config.title || Granite.I18n.getVar(config.name);
        context.overlayConstructor = config.overlayConstructor;
        context.toolbarConstructor = config.toolbarConstructor;
        context.editableConstructor = config.editableConstructor;
        if (config.sidePanel) {
            context.sidePanel = {};
            context.sidePanel.setUp = config.sidePanel.setUp;
            context.sidePanel.tearDown = config.sidePanel.tearDown
        }
        context.findEditables = config.findEditables;
        context.interactions = config.interactions;
        context.iconClass = config.iconClass
    }
    ns.Layer = ns.util.createClass({
        config: {},
        constructor: function Layer(config) {
            if (arguments[0] === undefined || typeof arguments[0] === "object")
                config = arguments[0];
            else
                config = {
                    name: arguments[0],
                    icon: arguments[1],
                    title: arguments[2],
                    overlayConstructor: arguments[3],
                    toolbarConstructor: arguments[4]
                };
            this.config = $.extend(true, {}, this.config, config);
            init(this, this.config)
        },
        activate: function() {
            if (this.editableConstructor) {
                ns.editables.clean();
                ns.ContentFrame.setEditableConstructor(this.editableConstructor)
            } else if (this.findEditables && typeof this.findEditables === "function") {
                ns.editables.clean();
                ns.ContentFrame.setFindEditablesFunction(this.findEditables)
            }
            if (ns.editables.length === 0)
                ns.ContentFrame.loadEditablesAsync().then(this._activateOverlays.bind(this));
            else
                this._activateOverlays();
            if (this.editableActions)
                ns.editableHelper.setUp(this.editableActions);
            if (this.toolbarConstructor) {
                ns.EditorFrame.editableToolbar = new this.toolbarConstructor({
                    actions: this.config.toolbarActions
                });
                ns.EditorFrame.editableToolbar.init()
            }
            if (this.sidePanel && typeof this.sidePanel.setUp === "function")
                this.sidePanel.setUp();
            if (this.interactions)
                ns.selection.bindEvents(this.interactions);
            setTimeout(function() {
                ns.ContentFrame.showFullScreenMask(false)
            }, 2E3);
            this.setUp();
            return this
        },
        _activateOverlays: function() {
            if (this.overlayConstructor) {
                ns.overlayManager.setOverlayRendering(this.overlayConstructor);
                ns.overlayManager.setup();
                ns.overlayManager.reposition(true);
                setTimeout(function() {
                    ns.overlayManager.setVisible(true)
                }, 300)
            }
        },
        deactivate: function() {
            ns.selection.deselectAll();
            if (this.editableConstructor) {
                ns.editables.clean();
                ns.ContentFrame.setEditableConstructor(null)
            } else if (this.findEditables) {
                ns.editables.clean();
                ns.ContentFrame.setFindEditablesFunction(null)
            }
            ns.DialogFrame.closeDialog();
            if (this.actions)
                ns.editableHelper.tearDown();
            if (this.overlayConstructor) {
                ns.overlayManager.teardown();
                ns.overlayManager.resetOverlayRendering();
                ns.overlayManager.setVisible(false)
            }
            if (this.toolbarConstructor)
                ns.EditorFrame.editableToolbar.destroy();
            if (this.sidePanel && typeof this.sidePanel.tearDown === "function")
                this.sidePanel.tearDown();
            ns.ui.SidePanel.showEmptyContent();
            ns.selection.unbindEvents();
            this.tearDown();
            return this
        },
        isAvailable: function() {
            return true
        },
        setUp: function() {},
        tearDown: function() {}
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.edit = {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.edit.Dialog = function(editable) {
        this.editable = editable
    }
    ;
    ns.util.inherits(ns.edit.Dialog, ns.ui.Dialog);
    ns.edit.Dialog.prototype.getConfig = function() {
        return {
            src: this.editable.config.dialogSrc,
            loadingMode: this.editable.config.dialogLoadingMode,
            layout: this.editable.config.dialogLayout || "auto"
        }
    }
    ;
    ns.edit.Dialog.prototype.getRequestData = function() {
        return {
            resourceType: this.editable.type
        }
    }
    ;
    ns.edit.Dialog.prototype.onSuccess = function(currentDialog, currentFloatingDialog) {
        var self = this;
        var properties = {};
        if (currentFloatingDialog) {
            var propertiesArray = currentFloatingDialog.serializeArray();
            propertiesArray.forEach(function(propertyNameValue) {
                properties[propertyNameValue.name] = propertyNameValue.value
            })
        } else
            ;channel.trigger("cq-persistence-after-update", [this.editable, properties]);
        var history = ns.history.Manager.getHistory();
        if (history)
            history.clear();
        ns.edit.EditableActions.REFRESH.execute(this.editable).then(function() {
            ns.selection.select(self.editable);
            self.editable.afterEdit();
            var editableParent = ns.editables.getParent(self.editable);
            editableParent && editableParent.afterChildEdit(self.editable)
        })
    }
    ;
    ns.edit.Dialog.prototype.onFocus = function() {
        if (ns.EditorFrame.editableToolbar && ns.EditorFrame.editableToolbar.close)
            ns.EditorFrame.editableToolbar.close()
    }
    ;
    ns.edit.Dialog.prototype.onOpen = function() {
        ns.history.Manager.setBlocked(true)
    }
    ;
    ns.edit.Dialog.prototype.onClose = function() {
        if (this.editable && this.editable.overlay && this.editable.overlay.dom)
            this.editable.overlay.dom.focus();
        ns.history.Manager.setBlocked(false)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var overlayClass = "cq-Overlay"
      , dropTargetClass = "cq-droptarget"
      , subDropTargetClass = "cq-subdroptarget cq-Overlay-subdroptarget";
    ns.edit.Overlay = function(editable, container) {
        ns.edit.Overlay.super_.constructor.call(this, editable, container)
    }
    ;
    ns.util.inherits(ns.edit.Overlay, ns.ui.Overlay);
    ns.edit.Overlay.prototype.dropTargets = null;
    ns.edit.Overlay.prototype.renderDropTargets = function(editable, container) {
        var self = this;
        var dropTarget = editable.getDropTarget();
        if (dropTarget)
            $.each(dropTarget, function(i, target) {
                target.overlay = $("\x3cdiv/\x3e", {
                    "class": dropTargetClass + " " + subDropTargetClass,
                    "draggable": self.renderDef.draggable,
                    "data-asset-accept": JSON.stringify(target.accept),
                    "data-asset-groups": JSON.stringify(target.groups),
                    "data-asset-id": target.id,
                    "data-path": editable.path
                }).appendTo(container)
            })
    }
    ;
    ns.edit.Overlay.prototype.renderLayoutHandles = function(editable, container) {
        var parent = ns.editables.getParent(editable);
        if (parent && ns.responsive.isResponsiveGrid(parent)) {
            if (!editable.isNewSection())
                var handleLeft = $("\x3cdiv/\x3e", {
                    "class": "editor-ResponsiveGrid-overlay-resizeHandle editor-ResponsiveGrid-overlay-resizeHandle--left",
                    "data-edge": "left"
                })
                  , handleRight = $("\x3cdiv/\x3e", {
                    "class": "editor-ResponsiveGrid-overlay-resizeHandle editor-ResponsiveGrid-overlay-resizeHandle--right",
                    "data-edge": "right"
                });
            container.append(handleLeft).append(handleRight)
        }
    }
    ;
    ns.edit.Overlay.prototype.renderChildEditorTargets = function(editable, container) {
        if (editable.config.editConfig && editable.config.editConfig.inplaceEditingConfig) {
            var childEditors = editable.config.editConfig.inplaceEditingConfig.childEditors;
            if (childEditors)
                $.each(childEditors, function(i, editor) {
                    if (!editable.getDropTarget(editor.id))
                        editor.overlay = $("\x3cdiv/\x3e", {
                            "class": dropTargetClass + " " + subDropTargetClass,
                            "data-asset-id": editor.id,
                            "data-path": editable.path
                        }).appendTo(container)
                })
        }
    }
    ;
    ns.edit.Overlay.prototype.positionDropTargets = function(editable, parent) {
        var dropTarget = editable.getDropTarget();
        if (dropTarget) {
            $.each(dropTarget, function(i, target) {
                if (!target.dom)
                    return;
                if (!target.dom.is(":visible"))
                    return;
                var offset = target.dom.offset();
                offset.width = this.dom.outerWidth() || parent.currentPos.width;
                offset.height = this.dom.outerHeight();
                if (target.overlay)
                    target.overlay.css({
                        position: "absolute",
                        top: offset.top - parent.currentPos.top,
                        left: offset.left - parent.currentPos.left,
                        width: offset.width > parent.currentPos.width ? parent.currentPos.width : offset.width,
                        height: offset.height > parent.currentPos.height ? parent.currentPos.height : offset.height
                    })
            });
            this.dropTargets = dropTarget
        }
    }
    ;
    ns.edit.Overlay.prototype.positionChildEditorTargets = function(editable, parent) {
        if (editable.config.editConfig && editable.config.editConfig.inplaceEditingConfig) {
            var childEditors = editable.config.editConfig.inplaceEditingConfig.childEditors
              , emptyPlaceHolderClass = "cq-placeholder";
            if (childEditors) {
                $.each(childEditors, function(i, editor) {
                    var target = editable.dom.find("." + editor.id);
                    var emptyPlaceholder = target.hasClass(emptyPlaceHolderClass) ? target : target.find("." + emptyPlaceHolderClass);
                    if (!target || !target.length)
                        return;
                    if (emptyPlaceholder.length)
                        target = emptyPlaceholder;
                    var offset = target.offset();
                    offset.width = target.outerWidth();
                    offset.height = target.outerHeight();
                    if (editor.overlay)
                        editor.overlay.css({
                            position: "absolute",
                            top: offset.top - parent.currentPos.top,
                            left: offset.left - parent.currentPos.left,
                            width: offset.width > parent.currentPos.width ? parent.currentPos.width : offset.width,
                            height: offset.height > parent.currentPos.height ? parent.currentPos.height : offset.height
                        })
                });
                this.childEditors = childEditors
            }
        }
    }
    ;
    ns.edit.Overlay.prototype.render = function(editable, container) {
        var dom = ns.edit.Overlay.super_.render.apply(this, arguments);
        this.renderDropTargets(editable, dom);
        this.renderChildEditorTargets(editable, dom);
        this.renderLayoutHandles(editable, dom);
        return dom
    }
    ;
    ns.edit.Overlay.prototype.position = function(editable, parent) {
        ns.edit.Overlay.super_.position.apply(this, arguments);
        this.positionDropTargets(editable, this);
        this.positionChildEditorTargets(editable, this)
    }
    ;
    ns.edit.Overlay.prototype.remove = function() {
        if (this.dropTargets)
            $.each(this.dropTargets, function(i, target) {
                if (target.overlay)
                    target.overlay.remove()
            });
        if (this.childEditors)
            $.each(this.childEditors, function(i, editor) {
                if (editor.overlay)
                    editor.overlay.remove()
            });
        ns.edit.Overlay.super_.remove.apply(this, arguments)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.edit.EditableActions = {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function canInsert(editableBefore, componentPath, componentGroup) {
        var parent = ns.editables.getParent(editableBefore);
        var allowedComponents = parent && ns.components.allowedComponentsFor[parent.path];
        var isAllowed = false;
        var componentRelativePath = componentPath.replace(/^\/[a-z]+\//, "");
        if (parent) {
            isAllowed = true;
            if (allowedComponents)
                isAllowed = allowedComponents.indexOf(componentPath) !== -1 || allowedComponents.indexOf(componentRelativePath) !== -1 || allowedComponents.indexOf(componentGroup) !== -1
        }
        return isAllowed && !editableBefore.isStructure()
    }
    ns.edit.EditableActions.INSERT = new ns.ui.EditableAction({
        execute: function doInsert(component, insertBehavior, editableNeighbor, historyConfig, additionalData) {
            var editableParent = ns.editables.getParent(editableNeighbor);
            function createFunction() {
                return ns.persistence.createParagraph(component, insertBehavior, editableNeighbor, additionalData).then(ns.edit.EditableActions.INSERT._postExecute(component, ns.editableHelper.getInsertFunction(insertBehavior), editableNeighbor, historyConfig, additionalData))
            }
            if (component && component.beforeInsert(createFunction, editableParent) === false || editableParent && editableParent.beforeChildInsert(createFunction, component) === false)
                return $.Deferred().promise().reject();
            else
                return ns.editableHelper.overlayCompleteRefresh(createFunction())
        },
        _postExecuteJSON: function(component, insertBehavior, editableNeighbor, historyConfig, additionalData, path) {
            var parentEditable = ns.editables.getParent(editableNeighbor);
            function loadEditables() {
                return ns.ContentFrame.loadEditablesAsync(true).then(function(editables) {
                    channel.trigger($.Event("cq-overlays-create", {
                        editables: editables
                    }))
                })
            }
            if (!parentEditable)
                return ns.persistence.readParagraph({
                    path: path
                }, {}).then(function(jsonData) {
                    jsonData = {
                        key: path.split("/").pop(),
                        value: jsonData
                    };
                    return ns.ContentFrame.executeCommand(editableNeighbor.path, insertBehavior, jsonData)
                }).then(function() {
                    return loadEditables()
                });
            else
                return ns.persistence.readParagraph(parentEditable, {}).then(function(jsonData) {
                    jsonData = {
                        key: parentEditable.getNodeName(),
                        value: jsonData
                    };
                    ns.ContentFrame.executeCommand(parentEditable.path, "replace", jsonData)
                }).then(function() {
                    return loadEditables()
                })
        },
        _postExecuteHTML: function(component, insertBehavior, editableNeighbor, historyConfig, additionalData, path) {
            var editableConfig = {
                path: ns.util.getSlingResourcePath(path)
            };
            return ns.persistence.readParagraph(editableConfig, null).then(function(data) {
                data = ns.editableHelper.updateDom(component, data);
                return ns.ContentFrame.executeCommand(editableNeighbor.path, insertBehavior, data).then(function() {
                    var i;
                    var editables;
                    var parent;
                    var rootEditable;
                    var historyStep;
                    var historyAction;
                    var historyEnabled = ns.history.Manager.isEnabled();
                    var preventAddHistory = historyConfig ? historyConfig.preventAddHistory : null;
                    var rootCopy = ns.ContentFrame.getEditableNode(path);
                    var resolveData = {
                        "newPath": path
                    };
                    if (rootCopy) {
                        editables = ns.ContentFrame.getEditables(rootCopy);
                        for (i = 0; i < editables.length; i++) {
                            var editable = editables[i];
                            var allowedComponents = ns.components.computeAllowedComponents(editable, ns.pageDesign);
                            ns.components.filterAllowedComponents(allowedComponents, true)
                        }
                        ns.editables.add(editables, {
                            insertBehavior: insertBehavior,
                            editableNeighbor: editableNeighbor
                        });
                        channel.trigger($.Event("cq-overlays-create", {
                            editables: editables
                        }))
                    }
                    rootEditable = ns.editables.find(path)[0];
                    resolveData.editable = rootEditable;
                    parent = ns.editables.getParent(rootEditable);
                    rootEditable.afterInsert();
                    if (parent)
                        parent.afterChildInsert(rootEditable);
                    if (historyEnabled && preventAddHistory !== true) {
                        historyStep = ns.history.util.Utils.beginStep();
                        historyAction = new ns.history.actions.InsertParagraph(path,editableNeighbor.path,rootEditable.type,[],additionalData);
                        historyStep.addAction(historyAction);
                        historyStep.commit()
                    }
                    return resolveData
                })
            })
        },
        condition: function(editableBefore, componentPath, componentGroup) {
            var parent = ns.editables.getParent(editableBefore);
            var allowedComponents;
            var isInsertAllowed;
            if (arguments.length === 2) {
                componentPath = arguments[1].getPath();
                componentGroup = arguments[1].getGroup()
            }
            if (parent && parent.path) {
                allowedComponents = ns.components.allowedComponentsFor[parent.path];
                isInsertAllowed = ns.pageInfoHelper.canModify() && editableBefore.hasAction("INSERT") && allowedComponents && !!allowedComponents.length;
                if (!componentPath || !componentGroup)
                    return isInsertAllowed;
                else
                    return isInsertAllowed && canInsert(editableBefore, componentPath, componentGroup)
            } else
                return false
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.EditableActions.REFRESH = new ns.ui.EditableAction({
        execute: function doRefresh(editable, config) {
            function process(editable) {
                return ns.persistence.readParagraph(editable, config).then(ns.edit.EditableActions.REFRESH._postExecute(editable))
            }
            return ns.editableHelper.overlayCompleteRefresh(process(editable))
        },
        _postExecuteJSON: function(editable) {
            return ns.persistence.readParagraph(editable, {}).then(function(data) {
                data = {
                    key: editable.getNodeName(),
                    value: data
                };
                return ns.ContentFrame.executeCommand(editable.path, "replace", data).then(function() {
                    return ns.ContentFrame.reloadEditable(editable)
                }).then(function(newEditable) {
                    return newEditable
                })
            })
        },
        _postExecuteHTML: function(editable, path, requestData) {
            var curComponent = ns.components.find({
                resourceType: editable.type
            });
            var dom = ns.editableHelper.updateDom(curComponent[0], requestData, editable);
            return ns.ContentFrame.executeCommand(editable.path, "replace", dom).then(function() {
                return ns.ContentFrame.reloadEditable(editable)
            }).then(function(newEditable) {
                return newEditable
            })
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function updateEditableChildren(editable, newLocation, oldPath) {
        var cfg, cfgNode, children = ns.editables.getChildren(editable);
        editable.path = Granite.HTTP.internalize(newLocation) + editable.path.substring(oldPath.length);
        editable.dom = ns.ContentFrame.getEditableNode(editable.path);
        cfgNode = ns.ContentFrame.getEditableConfigNode(editable.path);
        cfg = ns.configParser(cfgNode.data("config"));
        editable.updateConfig(cfg);
        ns.overlayManager.recreate(editable);
        var promises = [];
        var prevPromise = $.Deferred().resolve();
        var $jscomp$loop$0 = {};
        $jscomp$loop$0.$jscomp$loop$prop$i$1 = 0;
        for (; $jscomp$loop$0.$jscomp$loop$prop$i$1 < children.length; $jscomp$loop$0 = {
            $jscomp$loop$prop$i$1: $jscomp$loop$0.$jscomp$loop$prop$i$1
        },
        $jscomp$loop$0.$jscomp$loop$prop$i$1++) {
            var promise = prevPromise.then(function($jscomp$loop$0) {
                return function() {
                    return updateEditableChildren(children[$jscomp$loop$0.$jscomp$loop$prop$i$1], newLocation, oldPath)
                }
            }($jscomp$loop$0));
            promises.push(promise)
        }
        return $.when.apply(this, promises)
    }
    function replaceTarget(targetEditable) {
        if (!targetEditable)
            return $.Deferred().reject().promise();
        return ns.persistence.readParagraph(targetEditable, {}).then(function(data) {
            data = {
                key: targetEditable.getNodeName(),
                value: data
            };
            return ns.ContentFrame.executeCommand(targetEditable.path, "replace", data)
        })
    }
    ns.edit.EditableActions.MOVE = new ns.ui.EditableAction({
        execute: function doMove(editable, insertBehavior, editableNeighbor, historyConfig) {
            if (editable.config.path === editableNeighbor.config.path || editable.config.path + "/*" === editableNeighbor.config.path)
                return $.Deferred().reject().promise();
            var preventAddHistory = historyConfig ? historyConfig.preventAddHistory : null
              , historyEnabled = ns.history.Manager.isEnabled()
              , handleHistory = historyEnabled && preventAddHistory !== true
              , insertPath = null
              , editableParent = ns.editables.getParent(editable)
              , newEditableParent = ns.editables.getParent(editableNeighbor)
              , component = ns.components.find({
                resourceType: editable.type
            })[0];
            function moveFunction() {
                return ns.persistence.moveParagraph(editable, insertBehavior, editableNeighbor).then(ns.edit.EditableActions.MOVE._postExecute(editable, editableParent, newEditableParent, editableNeighbor, component, insertBehavior, insertPath, historyConfig, handleHistory))
            }
            if (component && component.beforeInsert(moveFunction, newEditableParent) === false || editable.beforeMove(moveFunction) === false || editableParent && editableParent.beforeChildMove(moveFunction, editable) === false || newEditableParent && newEditableParent.beforeChildInsert(moveFunction, editable) === false) {
                if (handleHistory && historyConfig.step)
                    ns.history.Manager.getHistory().removeStep(historyConfig.step);
                return $.Deferred().promise().reject()
            } else if (handleHistory)
                return ns.history.util.Utils.determineInsertPath(editable).then(function(data) {
                    if (data && data.insertPath)
                        insertPath = data.insertPath;
                    return ns.editableHelper.overlayCompleteRefresh(moveFunction())
                });
            else
                return ns.editableHelper.overlayCompleteRefresh(moveFunction())
        },
        _postExecuteJSON: function(editable, editableParent, newEditableParent, editableNeighbor, component, insertBehavior, insertPath, historyConfig, handleHistory) {
            var sourceEditable = ns.editables.getParent(editable);
            var targetEditable = ns.editables.getParent(editableNeighbor);
            if (!sourceEditable || !targetEditable)
                return;
            var singleParent = sourceEditable.path === targetEditable.path;
            var promises = [];
            if (!singleParent) {
                var sourceDeferred = replaceTarget(sourceEditable, sourceDeferred);
                promises.push(sourceDeferred)
            }
            var targetDeferred = replaceTarget(targetEditable, targetDeferred);
            promises.push(targetDeferred);
            return $.when.apply(this, promises).then(function() {
                return ns.ContentFrame.loadEditablesAsync(true)
            }).then(function(editables) {
                channel.trigger($.Event("cq-overlays-create", {
                    editables: editables
                }))
            })
        },
        _postExecuteHTML: function(editable, editableParent, newEditableParent, editableNeighbor, component, insertBehavior, insertPath, historyConfig, handleHistory, path) {
            var oldPath = editable.path;
            if (path === null)
                path = editable.path;
            return ns.ContentFrame.executeCommand(editable.path, "delete").then(function() {
                return ns.persistence.readParagraph({
                    path: ns.util.getSlingResourcePath(path)
                }).then(function(dom) {
                    var curComponent = ns.components.find({
                        resourceType: editable.type
                    });
                    dom = ns.editableHelper.updateDom(curComponent[0], dom, editable);
                    return ns.ContentFrame.executeCommand(editableNeighbor.path, ns.editableHelper.getInsertFunction(insertBehavior), dom).then(function() {
                        return updateEditableChildren(editable, path, oldPath).then(function(dom) {
                            var historyAction;
                            var resolveData = {
                                "newPath": path
                            };
                            ns.editables.move(editable, {
                                insertBehavior: insertBehavior,
                                editableNeighbor: editableNeighbor
                            });
                            editable.afterInsert();
                            editable.afterMove();
                            editableParent && editableParent.afterChildMove(editable);
                            newEditableParent && newEditableParent.afterChildInsert(editable);
                            ns.loadPageInfo();
                            if (handleHistory && historyConfig.step) {
                                historyAction = new ns.history.actions.MoveParagraph(path,oldPath,insertPath,editableNeighbor.path,editable.type,insertBehavior);
                                historyConfig.step.addAction(historyAction)
                            }
                            return resolveData
                        })
                    })
                })
            })
        },
        condition: function(editable, editableBefore) {
            var component = ns.components.find({
                resourceType: editable.type
            })[0];
            var componentPath = component.getPath();
            var componentGroup = "group:" + component.getGroup();
            var parent = ns.editables.getParent(editableBefore);
            return ns.pageInfoHelper.canModify() && editable.hasAction("COPY") && parent && parent.hasAction("INSERT") && ns.edit.EditableActions.INSERT.condition(editableBefore, componentPath, componentGroup)
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function isXfComponentCopied(editable) {
        return !!(editable && editable.dropTargets && editable.dropTargets.length > 0 && editable.dropTargets.find(function(dropTarget) {
            return dropTarget.name === "./fragmentVariationPath" || dropTarget.name === "./fragmentPath"
        }))
    }
    function validateExperienceFragment(editable) {
        var includingVariationPath = Granite.HTTP.getPath().replace(new RegExp(".+\\.html"), "");
        var errorMessage = null;
        $.ajax({
            url: Granite.HTTP.externalize("/bin/wcm/experiencefragments/verifyreferences.json"),
            type: "POST",
            async: false,
            data: {
                includingVariationPath: includingVariationPath,
                includedXFComponentPath: editable.config.path
            },
            success: function(data) {
                if (data.status === "invalid")
                    errorMessage = data.validationErrorMessage
            },
            error: function() {
                errorMessage = "Unknown validation error"
            }
        });
        return errorMessage
    }
    ns.edit.EditableActions.COPY = new ns.ui.EditableAction({
        execute: function doCopy(editable, insertBehavior, editableNeighbor, historyConfig) {
            var component = ns.components.find({
                resourceType: editable.type
            })[0]
              , editableParent = ns.editables.getParent(editable)
              , newEditableParent = ns.editables.getParent(editableNeighbor);
            function copyFunction() {
                return ns.persistence.copyParagraph(editable, insertBehavior, editableNeighbor).then(ns.edit.EditableActions.COPY._postExecute(editable, editableParent, newEditableParent, editableNeighbor, component, ns.editableHelper.getInsertFunction(insertBehavior), historyConfig))
            }
            if (component && component.beforeInsert(copyFunction, newEditableParent) === false || editable.beforeCopy(copyFunction) === false || editableParent && editableParent.beforeChildCopy(copyFunction, editable) === false || newEditableParent && newEditableParent.beforeChildInsert(copyFunction, editable) === false) {
                if (ns.history.Manager.isEnabled() && historyConfig.step)
                    ns.history.Manager.getHistory().removeStep(historyConfig.step);
                return $.Deferred().reject().promise()
            } else {
                if (isXfComponentCopied(editable)) {
                    var validationErrorMessage = validateExperienceFragment(editable);
                    if (validationErrorMessage) {
                        ns.ui.helpers.notify({
                            content: Granite.I18n.get(validationErrorMessage),
                            type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                        });
                        return $.Deferred().reject().promise()
                    }
                }
                return ns.editableHelper.overlayCompleteRefresh(copyFunction())
            }
        },
        _postExecuteJSON: function(editable, editableParent, newEditableParent, editableNeighbor, component, insertBehavior, historyConfig, path) {
            var parentEditable = ns.editables.getParent(editableNeighbor);
            function loadEditables() {
                return ns.ContentFrame.loadEditablesAsync(true).then(function(editables) {
                    channel.trigger($.Event("cq-overlays-create", {
                        editables: editables
                    }))
                })
            }
            if (parentEditable)
                return ns.persistence.readParagraph(parentEditable, {}).then(function(data) {
                    var jsonData = {
                        key: parentEditable.getNodeName(),
                        value: data
                    };
                    return ns.ContentFrame.executeCommand(parentEditable.path, "replace", jsonData)
                }).then(function() {
                    return loadEditables()
                });
            else
                return loadEditables()
        },
        _postExecuteHTML: function(editable, editableParent, newEditableParent, editableNeighbor, component, insertBehavior, historyConfig, path) {
            return ns.persistence.readParagraph({
                path: ns.util.getSlingResourcePath(path)
            }).then(function(dom) {
                var curComponent = ns.components.find({
                    resourceType: editable.type
                });
                dom = ns.editableHelper.updateDom(curComponent[0], dom, editable);
                return ns.ContentFrame.executeCommand(editableNeighbor.path, insertBehavior, dom).then(function() {
                    var i;
                    var editableNodes;
                    var rootCopy = ns.ContentFrame.getEditableNode(path);
                    var historyEnabled = ns.history.Manager.isEnabled();
                    var historyStep = historyConfig ? historyConfig.step : null;
                    var historyAction;
                    var createParams = {};
                    if (rootCopy) {
                        editableNodes = ns.ContentFrame.getEditables(rootCopy);
                        var editables = [];
                        for (i = 0; i < editableNodes.length; i++) {
                            editableNodes[i].dom = ns.ContentFrame.getEditableNode(editableNodes[i].path);
                            editables.push(editableNodes[i]);
                            editableNodes[i].afterInsert()
                        }
                        $.each(editableNodes, function(i, e) {
                            ns.components.computeAllowedComponents(e, ns.pageDesign)
                        });
                        ns.editables.add(editableNodes, {
                            insertBehavior: insertBehavior,
                            editableNeighbor: editableNeighbor
                        });
                        channel.trigger($.Event("cq-overlays-create", {
                            editables: editables
                        }))
                    }
                    editable.afterCopy();
                    editableParent && editableParent.afterChildCopy(editable);
                    newEditableParent && $.each(editableNodes, function(_, e) {
                        newEditableParent.afterChildInsert(e)
                    });
                    if (historyEnabled && historyStep) {
                        createParams["./@CopyFrom"] = editable.path;
                        historyAction = new ns.history.actions.InsertParagraph(path,editableNeighbor.path,editable.type,[],createParams);
                        historyConfig.step.addAction(historyAction)
                    }
                    return editable
                })
            })
        },
        condition: function(editable, editableBefore) {
            var component = ns.components.find({
                resourceType: editable.type
            })[0];
            var componentPath = component.getPath();
            var componentGroup = "group:" + component.getGroup();
            var parent = ns.editables.getParent(editableBefore);
            return ns.pageInfoHelper.canModify() && editable.hasAction("COPY") && parent && parent.hasAction("INSERT") && ns.edit.EditableActions.INSERT.condition(editableBefore, componentPath, componentGroup)
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var PROPERTIES_TO_DELETE = ["jcr:created", "jcr:lastModified"];
    ns.edit.EditableActions.UPDATE = new ns.ui.EditableAction({
        execute: function doUpdate(editable, properties) {
            var editableParent = ns.editables.getParent(editable);
            Object.keys(properties).forEach(function(key) {
                var value = properties[key];
                var prefixedKey = key.replace(/^(.\/)?/, "./");
                if (PROPERTIES_TO_DELETE.includes(key) || PROPERTIES_TO_DELETE.includes(prefixedKey))
                    delete properties[key];
                else if (key !== prefixedKey) {
                    delete properties[key];
                    properties[prefixedKey] = value
                }
            });
            function updateFunction() {
                return ns.persistence.updateParagraph(editable, properties).then(function() {
                    return ns.edit.EditableActions.REFRESH.execute(editable).then(ns.edit.EditableActions.UPDATE._postExecute(editable, editableParent))
                }).fail(function(jqXHR) {
                    var customResponse = $(jqXHR.responseText).filter("title").text();
                    var errorMessage = customResponse.substr(customResponse.indexOf(" ")).trim();
                    if (errorMessage) {
                        ns.edit.EditableActions.REFRESH.execute(editable, properties);
                        ns.ui.helpers.notify({
                            content: Granite.I18n.get(errorMessage),
                            type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                        })
                    }
                    return ns.edit.EditableActions.REFRESH.execute(editable, properties)
                })
            }
            if (editable.beforeEdit(updateFunction, properties) === false || editableParent && editableParent.beforeChildEdit(updateFunction, properties, editable) === false)
                return $.Deferred().reject().promise();
            else
                return ns.editableHelper.overlayCompleteRefresh(updateFunction())
        },
        _postExecuteJSON: function(editable, editableParent) {
            return $.Deferred().resolve(editable).promise()
        },
        _postExecuteHTML: function(editable, editableParent) {
            editable.afterEdit();
            editableParent && editableParent.afterChildEdit(editable);
            ns.overlayManager.recreate(editable);
            return $.Deferred().resolve(editable).promise()
        },
        condition: function(editable) {
            return ns.pageInfoHelper.canModify() && editable.hasAction("EDIT") && !(editable.isStructure() && editable.isStructureLocked())
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.EditableActions.DELETE = new ns.ui.EditableAction({
        execute: function doDelete(editables, historyConfig) {
            var historyEnabled = ns.history.Manager.isEnabled(), historyStep, historyAction, preventAddHistory = historyConfig ? historyConfig.preventAddHistory : null, handleHistory = historyEnabled && preventAddHistory !== true, editableCount = 0, historyData = [];
            var getEditableData = function(editable) {
                return ns.history.util.Utils.getCurrentData(editable).then(function(data) {
                    var history = ns.history.Manager.getHistory();
                    data.compInfo = {
                        "type": editable.type
                    };
                    for (var i = 0; i < data.blobs.length; i++)
                        data.blobs[i].save(history.config.binaryServletUrl, editable.path);
                    historyData.push(data)
                }).fail(function(data) {
                    if (data.status === 300)
                        handleHistory = false
                })
            };
            var deleteFunction = function(editable) {
                var editableParent = ns.editables.getParent(editable);
                function process() {
                    return ns.persistence.deleteParagraph(editable).then(ns.edit.EditableActions.DELETE._postExecute(editable, editableParent))
                }
                if (editable.beforeDelete(process) === false || editableParent && editableParent.beforeChildDelete(process, editable) === false) {
                    if (handleHistory)
                        ns.history.Manager.getHistory().removeStep(historyStep);
                    return $.Deferred().reject().promise()
                } else {
                    if (handleHistory) {
                        var data = historyData[editableCount];
                        historyAction = new ns.history.actions.DeleteParagraph(editable.path,data.insertBefore,data.data,data.blobs,data.compInfo);
                        historyStep.addAction(historyAction);
                        editableCount++
                    }
                    return process()
                }
            };
            if (handleHistory) {
                historyStep = ns.history.util.Utils.beginStep();
                return ns.editableHelper.doBulkOperation(getEditableData, [], editables).then(function() {
                    return ns.editableHelper.overlayCompleteRefresh(ns.editableHelper.doBulkOperation(deleteFunction, [], editables)).then(function() {
                        ns.history.util.Utils.finalizeStep(historyStep)
                    })
                })
            } else
                return ns.editableHelper.overlayCompleteRefresh(ns.editableHelper.doBulkOperation(deleteFunction, [], editables))
        },
        _postExecuteJSON: function(editable, editableParent) {
            return ns.ContentFrame.executeCommand(editable.path, "delete").then(function() {
                return ns.ContentFrame.loadEditablesAsync(true).then(function(editables) {
                    channel.trigger($.Event("cq-overlays-create", {
                        editables: editables
                    }))
                })
            })
        },
        _postExecuteHTML: function(editable, editableParent) {
            return ns.ContentFrame.executeCommand(editable.path, "delete").then(function() {
                ns.editables.remove(editable, true);
                editable.afterDelete();
                editableParent && editableParent.afterChildDelete(editable);
                editable.destroy()
            })
        },
        condition: function(editable) {
            return ns.pageInfoHelper.canModify() && editable.hasAction("DELETE") && !editable.isStructure()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.edit.ToolbarActions = {};
    Object.defineProperty(ns.edit, "Actions", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions instead");
            return ns.edit.ToolbarActions
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions instead");
            ns.edit.ToolbarActions = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.ToolbarActions.EDIT = new ns.ui.ToolbarAction({
        name: "EDIT",
        text: Granite.I18n.get("Edit"),
        icon: "edit",
        execute: function openInPlaceEditor(editable) {
            ns.editor.startEditor(editable.config.editConfig.inplaceEditingConfig.editorType, editable);
            if (editable.config.editConfig.inplaceEditingConfig.editorType === "hybrid")
                return false
        },
        condition: function(editable) {
            return ns.pageInfoHelper.canModify() && editable.hasAction("EDIT") && editable.canInPlaceEdit()
        },
        isNonMulti: true
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.ToolbarActions.CONFIGURE = new ns.ui.ToolbarAction({
        name: "CONFIGURE",
        icon: "wrench",
        text: Granite.I18n.get("Configure"),
        execute: function openEditDialog(editable) {
            ns.DialogFrame.openDialog(new ns.edit.Dialog(editable))
        },
        condition: function(editable) {
            return ns.pageInfoHelper.canModify() && editable.hasAction("CONFIGURE") && !!editable.config.dialog
        },
        isNonMulti: true
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var NN_STYLE_GROUPS = "cq:styleGroups";
    var NN_STYLES = "cq:styles";
    var popover;
    ns.edit.ToolbarActions.STYLE = new ns.ui.ToolbarAction({
        name: "STYLE",
        text: Granite.I18n.get("Styles"),
        icon: "brush",
        render: function($el) {
            if (popover)
                popover.target = $el[0];
            return $el
        },
        execute: function() {
            return false
        },
        condition: function(editable) {
            var passed = false;
            var styleGroups = ns.editableHelper.getStyleProperty(editable, NN_STYLE_GROUPS);
            var stylesLength = 0;
            if (styleGroups != null)
                for (var item in styleGroups)
                    if (styleGroups.hasOwnProperty(item)) {
                        var group = styleGroups[item];
                        if (group.hasOwnProperty(NN_STYLES)) {
                            stylesLength = stylesLength + Object.keys(group[NN_STYLES]).length;
                            if (stylesLength > 0) {
                                passed = true;
                                break
                            }
                        }
                    }
            return ns.pageInfoHelper.canModify() && editable.hasAction("CONFIGURE") && passed && popover
        },
        isNonMulti: true
    });
    channel.on("cq-editor-loaded", function() {
        popover = document.getElementById("editor-StyleSelector--component")
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var dialog = null, selectList = null, $searchComponent = null, groupSelect = null, memoizedGroupSelection;
    function filterComponent(allowedComponents) {
        var components = ns.components.allowedComponents.sort(ns.components.sortComponents)
          , keyword = $searchComponent[0].value
          , groups = [];
        selectList.items.clear();
        resetGroupSelector();
        if (keyword !== undefined && keyword !== null)
            keyword = String(keyword).trim().toLowerCase();
        else
            keyword = "";
        components.forEach(function(c) {
            var cfg = c.componentConfig;
            var group = c.getGroup();
            if (keyword.length > 0)
                var isKeywordFound = (Granite.I18n.getVar(cfg.title) || "").toLowerCase().indexOf(keyword) !== -1;
            if (!groups.includes(group)) {
                groups.push(group);
                var isSelected = memoizedGroupSelection === group;
                if (isSelected)
                    memoizedGroupSelection = null;
                groupSelect.items.add({
                    value: group,
                    content: {
                        textContent: group
                    },
                    selected: isSelected
                })
            }
            if (groupSelect.value && groupSelect.value !== "*" && group !== groupSelect.value)
                return;
            if (!(keyword.length > 0) || isKeywordFound) {
                var componentAbsolutePath = c.componentConfig.path
                  , componentRelativePath = componentAbsolutePath.replace(/^\/[a-z]+\//, "");
                if (allowedComponents.indexOf(componentAbsolutePath) > -1 || allowedComponents.indexOf(componentRelativePath) > -1 || allowedComponents.indexOf("group:" + c.getGroup()) > -1) {
                    var content = new Coral.List.Item.Content;
                    content.appendChild(c.toHtml(true));
                    var item = selectList.items.add((new Coral.List.Item).set({
                        content: content,
                        value: c.getPath()
                    }));
                    item.setAttribute("value", c.getPath())
                }
            }
        })
    }
    function resetGroupSelector() {
        memoizedGroupSelection = groupSelect.value;
        if (groupSelect.items) {
            groupSelect.items.clear();
            groupSelect.items.add({
                value: "*",
                content: {
                    textContent: Granite.I18n.get("All")
                }
            })
        }
    }
    function createInsertComponentDialog() {
        if (!dialog) {
            dialog = (new Coral.Dialog).set({
                closable: Coral.Dialog.closable.ON,
                header: {
                    innerHTML: Granite.I18n.get("Insert New Component")
                },
                content: {
                    innerHTML: '\x3ccoral-search class\x3d"InsertComponentDialog-search" placeholder\x3d"' + Granite.I18n.get("Enter Keyword") + '"\x3e\x3c/coral-search\x3e' + '\x3ccoral-select class\x3d"InsertComponentDialog-groups"  placeholder\x3d"' + Granite.I18n.get("Group") + '"\x3e\x3c/coral-select\x3e\x3ccoral-list ' + 'class\x3d"InsertComponentDialog-list editor-ComponentBrowser-components"\x3e\x3c/coral-list\x3e'
                }
            });
            dialog.classList.add("InsertComponentDialog");
            dialog.content.classList.add("InsertComponentDialog-components");
            $searchComponent = $(dialog.content).find(".InsertComponentDialog-search");
            groupSelect = $(dialog.content).find(".InsertComponentDialog-groups")[0];
            resetGroupSelector();
            document.body.appendChild(dialog)
        } else {
            $searchComponent[0].value = "";
            memoizedGroupSelection = null;
            resetGroupSelector()
        }
    }
    function bindEventToInsertComponentDialog(allowedComponents, editable) {
        $searchComponent[0].off("coral-search:input");
        $searchComponent[0].on("coral-search:input", $.debounce(150, function() {
            filterComponent(allowedComponents)
        }));
        $searchComponent[0].off("coral-search:clear").on("coral-search:clear", function() {
            if ($searchComponent[0].value.trim().length) {
                $searchComponent[0].value = "";
                filterComponent(allowedComponents)
            }
        });
        groupSelect.on("change", function() {
            filterComponent(allowedComponents)
        });
        selectList.off("click").on("click", "coral-list-item", function(event) {
            if (event.target.getAttribute("is") === "coral-button")
                return;
            var value = event.target.closest("coral-list-item").value;
            if (!value)
                return;
            dialog.hide();
            var component = ns.components.find(value);
            if (component.length > 0)
                ns.editableHelper.actions.INSERT.execute(component[0], ns.persistence.PARAGRAPH_ORDER.before, editable)
        })
    }
    ns.edit.ToolbarActions.INSERT = new ns.ui.ToolbarAction({
        name: "INSERT",
        icon: "add",
        text: Granite.I18n.get("Insert component"),
        execute: function openInsertDialog(editable) {
            var parent = ns.editables.getParent(editable)
              , allowedComponents = ns.components.computeAllowedComponents(parent, ns.pageDesign);
            createInsertComponentDialog();
            Coral.commons.ready(dialog, function() {
                selectList = $(dialog).find(".InsertComponentDialog-list")[0];
                filterComponent(allowedComponents);
                bindEventToInsertComponentDialog(allowedComponents, editable);
                dialog.show()
            })
        },
        condition: function(editable) {
            return ns.edit.EditableActions.INSERT.condition(editable)
        },
        isNonMulti: true
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.ToolbarActions.COPY = new ns.ui.ToolbarAction({
        name: "COPY",
        icon: "copy",
        text: Granite.I18n.get("Copy"),
        shortcut: "ctrl+c",
        execute: function copyToClipboard() {
            var selected = ns.selection.getAllSelected();
            ns.clipboard.setEditablesToCopy(selected);
            ns.selection.deselectAll()
        },
        condition: function(editable) {
            return editable.hasAction("COPY")
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.ToolbarActions.CUT = new ns.ui.ToolbarAction({
        name: "CUT",
        icon: "cut",
        text: Granite.I18n.get("Cut"),
        shortcut: "ctrl+x",
        execute: function cutToClipboard() {
            var selected = ns.selection.getAllSelected();
            ns.clipboard.setEditablesToCut(selected);
            ns.selection.deselectAll()
        },
        condition: function(editable) {
            return ns.pageInfoHelper.canModify() && editable.hasAction("MOVE") && !editable.isStructure()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.ToolbarActions.PASTE = new ns.ui.ToolbarAction({
        name: "PASTE",
        icon: "paste",
        text: Granite.I18n.get("Paste"),
        shortcut: "ctrl+v",
        execute: function(editableBefore) {
            var editables = ns.clipboard.getEditables();
            var pasteOperation = ns.clipboard.shouldCut() ? ns.edit.EditableActions.MOVE.execute : ns.edit.EditableActions.COPY.execute;
            var historyConfig = {};
            var historyEnabled = ns.history.Manager.isEnabled();
            if (historyEnabled)
                historyConfig.step = ns.history.util.Utils.beginStep();
            ns.editableHelper.doBulkOperation(pasteOperation, [ns.persistence.PARAGRAPH_ORDER.before, editableBefore, historyConfig], editables).then(function() {
                ns.history.util.Utils.finalizeStep(historyConfig.step)
            });
            ns.selection.deselectAll()
        },
        condition: function(editableBefore) {
            var isInsertAllowedForAll = ns.clipboard.getEditables().every(function(editableToInsert) {
                var component = ns.components.find({
                    resourceType: editableToInsert.type
                })[0];
                if (component) {
                    var componentPath = component.getPath();
                    var componentGroup = "group:" + component.getGroup();
                    return ns.edit.EditableActions.INSERT.condition(editableBefore, componentPath, componentGroup)
                } else
                    return ns.edit.EditableActions.INSERT.condition(editableBefore)
            });
            var isEditableSelected = $(document).find(".is-selected.is-active").data("type") === "Editable";
            var hasOpenOverlay = $("coral-dialog.is-open").length > 0;
            var isSidePanelInFocus = document.getElementById("SidePanel") && document.getElementById("SidePanel").contains(document.activeElement);
            return !ns.clipboard.isEmpty() && isInsertAllowedForAll && isEditableSelected && !hasOpenOverlay && !isSidePanelInFocus
        },
        isNonMulti: true
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.edit.ToolbarActions.DELETE = new ns.ui.ToolbarAction({
        name: "DELETE",
        icon: "delete",
        text: Granite.I18n.get("Delete"),
        shortcut: "ctrl+del",
        execute: function deleteConfirm() {
            var selected = ns.selection.getAllSelected();
            ns.ui.helpers.prompt({
                title: Granite.I18n.get("Delete"),
                message: Granite.I18n.get("You are going to delete the selected component(s)."),
                type: ns.ui.helpers.PROMPT_TYPES.WARNING,
                actions: [{
                    id: "CANCEL",
                    text: Granite.I18n.get("Cancel", "Label for Cancel button")
                }, {
                    id: "DELETE",
                    text: Granite.I18n.get("Delete", "Label for Confirm button"),
                    warning: true
                }],
                callback: function(actionId) {
                    if (actionId === "CANCEL")
                        ns.selection.deselectAll();
                    else {
                        ns.selection.deselectAll();
                        ns.editableHelper.actions.DELETE.execute(selected)
                    }
                }
            })
        },
        condition: function(editable) {
            return ns.pageInfoHelper.canModify() && editable.hasAction("DELETE") && !editable.isStructure()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function displaySelectParentPopOver(parents, target) {
        var popover = (new Coral.Popover).set({
            alignAt: Coral.Overlay.align.LEFT_BOTTOM,
            alignMy: Coral.Overlay.align.LEFT_TOP,
            content: {
                innerHTML: ""
            },
            target: target[0],
            open: true
        });
        popover.on("coral-overlay:close", function() {
            $(popover).remove()
        });
        var i = 0;
        var length = parents.length;
        var $parentList;
        $parentList = $('\x3ccoral-buttonlist class\x3d"cq-select-parent-list"\x3e\x3c/coral-buttonlist\x3e');
        for (; i < length; i++) {
            var title = ns.editableHelper.getEditableDisplayableName(parents[i]);
            var item = (new Coral.ButtonList.Item).set({
                content: {
                    innerHTML: title
                }
            });
            item.title = title;
            var $item = $(item);
            $item.data("path", parents[i].path).addClass("cq-select-parent-item");
            $parentList.append(item);
            if ($item.find("coral-icon").length === 0)
                item.icon = $("\x3ccoral-icon\x3e\x3c/coral-icon\x3e");
            $item.find("coral-icon").addClass("cq-select-parent-colorhint-" + i)[0].show()
        }
        $parentList.appendTo(popover.content);
        $(popover).addClass("cq-select-parent").appendTo(document.body)
    }
    function bindPopOverEvents($parentItems, parents) {
        $parentItems.on("mouseenter mouseleave", function(event) {
            event.stopImmediatePropagation();
            var $target = $(event.target);
            var path = $target.data("path") ? $target.data("path") : $target.closest(".cq-select-parent-item").data("path");
            var editableParentPreSelected = ns.editables.find(path)[0];
            ns.selection.deselectAll();
            editableParentPreSelected.overlay.dom.toggleClass("is-selected", event.type === "mouseenter")
        }).on("touchstart", function(event) {
            event.preventDefault();
            $(event.target).addClass("selected")
        }).on("click", function(event) {
            var $target = $(event.target);
            var path = $target.data("path") ? $target.data("path") : $target.closest(".cq-select-parent-item").data("path");
            var editableParentSelected = ns.editables.find(path)[0];
            event.stopPropagation();
            unhighlightParents(parents);
            ns.selection.deselectAll();
            ns.selection.deactivateCurrent();
            ns.selection.select(editableParentSelected);
            ns.selection.activate(editableParentSelected);
            channel.trigger($.Event("cq-interaction-focus", {
                editable: editableParentSelected
            }));
            ns.EditorFrame.editableToolbar.render(editableParentSelected).position(editableParentSelected);
            $target.closest("coral-popover").remove()
        })
    }
    function highlightParents(parents) {
        var i = 0;
        var length = parents.length;
        ns.selection.deselectAll();
        for (; i < length; i++) {
            parents[i].overlay.dom.addClass("parent-border-" + i);
            ns.selection.select(parents[i])
        }
    }
    function unhighlightParents(parents) {
        var i = 0;
        var length = parents.length;
        for (; i < length; i++)
            parents[i].overlay.dom.css({
                borderColor: ""
            })
    }
    ns.edit.ToolbarActions.PARENT = new ns.ui.ToolbarAction({
        name: "PARENT",
        icon: "selectContainer",
        text: Granite.I18n.get("Parent"),
        execute: function(editable, selectableParents, target) {
            var parents = selectableParents || ns.editables.getSelectableParents(editable);
            var $parentItems;
            if (parents.length === 1) {
                var parent = parents[0];
                unhighlightParents(parents);
                ns.selection.deselectAll();
                ns.selection.deactivateCurrent();
                ns.selection.select(parent);
                ns.selection.activate(parent);
                channel.trigger($.Event("cq-interaction-focus", {
                    editable: parent
                }));
                ns.EditorFrame.editableToolbar.render(parent).position(parent)
            } else {
                highlightParents(parents);
                displaySelectParentPopOver(parents, target);
                $parentItems = $(".cq-select-parent-item");
                bindPopOverEvents($parentItems, parents);
                channel.one("cq-interaction-blur", function() {
                    unhighlightParents(parents);
                    $parentItems.off()
                })
            }
            return false
        },
        condition: function(editable) {
            return editable.hasAction("PARENT") && ns.editables.getSelectableParents(editable).length > 0
        },
        isNonMulti: true
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function deactivateGroupButton(toolbar) {
        toolbar.getButton("GROUP").removeClass("is-active")
    }
    ns.edit.ToolbarActions.GROUP = new ns.ui.ToolbarAction({
        name: "GROUP",
        icon: "group",
        text: Granite.I18n.get("Group"),
        shortcut: function(editable, keymap) {
            var self = this;
            var groupButton = this.getButton("GROUP");
            if (keymap.ctrl && groupButton) {
                groupButton.addClass("is-active");
                channel.one("keyup", function() {
                    deactivateGroupButton(self)
                });
                $(window).one("focus", function() {
                    deactivateGroupButton(self)
                })
            }
            return false
        },
        execute: function toggleGroupSelection(editable, param, target) {
            if (ns.selection.isSingleSelection()) {
                target.addClass("is-active");
                ns.selection.buttonPressed = true
            } else {
                target.removeClass("is-active");
                ns.selection.buttonPressed = false
            }
            return false
        },
        render: function(dom) {
            return dom.toggleClass("is-active", !ns.selection.isSingleSelection())
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    var TOOLBAR_RESET_NAMESPACE = "toolbar-reset";
    var INTERACTION_FOCUS = "cq-interaction-focus";
    var TOOLBAR_RESET_BLUR_EVENT = "cq-interaction-blur." + TOOLBAR_RESET_NAMESPACE;
    var TOOLBAR_RESET_FOCUS_EVENT = INTERACTION_FOCUS + "." + TOOLBAR_RESET_NAMESPACE;
    ns.edit.ToolbarActions.LAYOUT = new ns.ui.ToolbarAction({
        name: "LAYOUT",
        icon: "switch",
        order: "last",
        text: Granite.I18n.get("Layout"),
        execute: function(editable) {
            var editablePath = editable.path;
            var toolbarConstructor = Object.getPrototypeOf(ns.EditorFrame.editableToolbar).constructor;
            var toolbarConfig = ns.EditorFrame.editableToolbar.config;
            ns.EditorFrame.editableToolbar.close();
            ns.EditorFrame.editableToolbar.destroy();
            ns.EditorFrame.editableToolbar = new ns.edit.LayoutToolbar;
            ns.EditorFrame.editableToolbar.open(editable);
            channel.on(TOOLBAR_RESET_BLUR_EVENT + " " + TOOLBAR_RESET_FOCUS_EVENT, function(event) {
                if (!(event.type === INTERACTION_FOCUS && event.namespace === TOOLBAR_RESET_NAMESPACE) && event.editable && editablePath === event.editable.path)
                    return;
                channel.off(TOOLBAR_RESET_BLUR_EVENT + " " + TOOLBAR_RESET_FOCUS_EVENT);
                ns.EditorFrame.editableToolbar.close();
                ns.EditorFrame.editableToolbar.destroy();
                ns.EditorFrame.editableToolbar = new toolbarConstructor(toolbarConfig);
                if (event.type === INTERACTION_FOCUS)
                    ns.EditorFrame.editableToolbar.open(event.editable)
            });
            return false
        },
        condition: function(editable) {
            var layers = ns.layerManager.getLayers();
            var responsiveAvailable = layers && layers[ns.responsive.CONFIG.name] && layers[ns.responsive.CONFIG.name].isAvailable();
            return responsiveAvailable && ns.pageInfoHelper.canModify() && editable.hasAction("LAYOUT")
        },
        render: function(dom) {
            return dom.addClass("cq-EditableToolbar-button--modeSwitcher")
        },
        isNonMulti: true
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.edit.Toolbar = ns.util.extendClass(ns.ui.Toolbar, {
        constructor: function(config) {
            var customActionsConfig = $.extend(true, {}, config, {
                actions: ns.edit.Toolbar._customActions
            });
            ns.edit.Toolbar.super_.constructor.call(this, customActionsConfig)
        },
        _onFastDblClick: function(event) {
            var editable = event.editable;
            var configureAction = this.config.actions.CONFIGURE;
            var insertComponentAction = this.config.actions.INSERT;
            if (configureAction && configureAction.condition && configureAction.condition(editable))
                configureAction.execute(editable);
            else if (insertComponentAction && insertComponentAction.condition && insertComponentAction.condition(editable))
                insertComponentAction.execute(editable)
        },
        _onSlowDblClick: function() {
            Granite.author.util.deprecated()
        },
        _bindEvents: function() {
            ns.edit.Toolbar.super_._bindEvents.apply(this, arguments);
            channel.on("cq-interaction-fastdblclick.edit-toolbar", this._onFastDblClick.bind(this))
        },
        _unbindEvents: function() {
            ns.edit.Toolbar.super_._unbindEvents.apply(this, arguments);
            channel.off("cq-interaction-slowdblclick.edit-toolbar");
            channel.off("cq-interaction-fastdblclick.edit-toolbar")
        },
        registerAction: function(name, action, override) {
            var isRegistered = name in ns.edit.Toolbar._customActions;
            if (!isRegistered)
                ns.edit.Toolbar._customActions[name] = action;
            if (!isRegistered || override)
                ns.edit.Toolbar.super_.registerAction.apply(this, arguments)
        },
        appendButton: function(editable, name, action) {
            if (!ns.selection.isSingleSelection() && action.isNonMulti)
                return null;
            return ns.edit.Toolbar.super_.appendButton.apply(this, arguments)
        },
        render: function(editable) {
            var self = this;
            this.dom.empty();
            var actionsObj = this.config.actions;
            var availableActions = this.getAvailableActions(editable);
            availableActions = availableActions.concat(Object.keys(ns.edit.Toolbar._customActions));
            var allAvailableActions = _extractAllAvailableActions(actionsObj, availableActions);
            var sortedActions = ns.edit.Toolbar.super_._sortActions(allAvailableActions);
            sortedActions.forEach(function(action, index) {
                self.appendButton(editable, action.name, action)
            });
            self._makeAccessible();
            return this
        }
    });
    function _extractAllAvailableActions(actionsObj, availableActions) {
        var all = [];
        if (Array.isArray(availableActions))
            availableActions.forEach(function(item) {
                var action;
                if (typeof item === "string") {
                    if (actionsObj && actionsObj[item]) {
                        action = actionsObj[item];
                        action.name = item
                    }
                } else
                    action = item;
                if (action && typeof action === "object")
                    all.push(action)
            });
        return all
    }
    ns.edit.Toolbar._customActions = {};
    Object.defineProperty(ns.edit.Toolbar, "defaultActions", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions instead");
            return ns.edit.ToolbarActions
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions instead");
            ns.edit.ToolbarActions = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function handleUndesiredHover(editable) {
        editable.overlay.dom.removeClass("is-hover")
    }
    function onOverlayHover(event) {
        var editable = event.editable;
        event.stopImmediatePropagation();
        editable.overlay.setHover(event.originalEvent.type === "mouseover");
        channel.trigger($.Event("cq-interaction-hover", {
            editable: event.editable
        }))
    }
    function onOverlayClick(event) {
        var editable = event.editable;
        var active;
        if (editable.overlay.isDisabled())
            return;
        if (editable.hasAction("PARENT") && editable.config.editConfig.actions.length === 1) {
            var parent = ns.editables.getParent(editable);
            if (parent.hasActionsAvailable())
                channel.trigger($.Event("cq-overlay-click", {
                    editable: parent,
                    originalEvent: {
                        currentTarget: parent.overlay.dom
                    }
                }));
            return
        }
        if (ns.selection.isSingleSelection()) {
            ns.selection.deselectAll();
            ns.selection.deactivateCurrent();
            ns.selection.select(editable);
            ns.selection.activate(editable)
        } else if (editable.overlay.isSelected()) {
            if (editable.overlay.isActive()) {
                var previous = ns.selection.getPreviousSelected();
                if (previous) {
                    ns.selection.deselect(editable);
                    ns.selection.deactivateCurrent();
                    ns.selection.activate(previous)
                } else {
                    ns.selection.deselect(editable);
                    ns.selection.deactivateCurrent();
                    channel.trigger("cq-interaction-blur")
                }
            } else
                ns.selection.deselect(editable);
            handleUndesiredHover(editable)
        } else {
            ns.selection.deactivateCurrent();
            ns.selection.select(editable);
            ns.selection.activate(editable)
        }
        active = ns.selection.getCurrentActive();
        if (active)
            channel.trigger($.Event("cq-interaction-focus", {
                editable: active
            }))
    }
    function onOverlaySlowDblClick(event) {
        var editable = event.editable;
        if (editable.overlay.isDisabled())
            return;
        if (ns.selection.isSingleSelection())
            channel.trigger($.Event("cq-interaction-slowdblclick", {
                editable: editable
            }))
    }
    function onOverlayFastDblClick(event) {
        var editable = event.editable;
        if (editable.overlay.isDisabled())
            return;
        if (ns.selection.isSingleSelection())
            channel.trigger($.Event("cq-interaction-fastdblclick", {
                editable: editable
            }))
    }
    function onOutsideOverlayClick(event) {
        ns.selection.deselectAll();
        ns.selection.deactivateCurrent();
        channel.trigger("cq-interaction-blur")
    }
    ns.edit.Interactions = {
        onOverlayHover: onOverlayHover,
        onOverlayClick: onOverlayClick,
        onOverlayFastDblClick: onOverlayFastDblClick,
        onOverlaySlowDblClick: onOverlaySlowDblClick,
        onOutsideOverlayClick: onOutsideOverlayClick,
        ignoreGroupSelection: false
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function handleWcmModeCookie() {
        if ($.cookie("wcmmode") !== "edit") {
            $.cookie("wcmmode", "edit", {
                path: "/"
            });
            channel.trigger("editor-frame-mode-changed")
        }
    }
    function setUpSidePanel() {
        ns.ui.SidePanel.showContent("js-SidePanel-content--edit");
        ns.ui.SidePanel.restore()
    }
    ns.edit.CONFIG = {
        name: "Edit",
        icon: "edit",
        title: Granite.I18n.get("Edit", "title of authoring layer"),
        toolbarConstructor: ns.edit.Toolbar,
        overlayConstructor: ns.edit.Overlay,
        toolbarActions: ns.edit.ToolbarActions,
        sidePanel: {
            setUp: setUpSidePanel
        },
        editableActions: ns.edit.EditableActions,
        interactions: ns.edit.Interactions
    };
    ns.edit.Layer = ns.util.extendClass(ns.Layer, {
        config: ns.edit.CONFIG,
        isAvailable: function() {
            if (ns.pageInfoHelper && ns.pageInfoHelper.isLocked())
                return ns.ContentFrame.getUserID() === ns.pageInfoHelper.getLockOwner();
            return true
        },
        setUp: function() {
            handleWcmModeCookie();
            ns.ui.globalBar.styleSelectorTrigger.disabled = false
        },
        tearDown: function() {
            ns.ui.globalBar.styleSelectorTrigger.disabled = true
        },
        bindEventListeners: function() {
            Granite.author.util.deprecated("Use Granite.author.edit.Interactions instead")
        },
        unbindEventListeners: function() {
            Granite.author.util.deprecated("Use Granite.author.edit.Interactions instead")
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.design = {
        isDesignable: function(editable) {
            if (editable.config.designDialog)
                return true;
            return false
        },
        getSelectableParents: function(editable) {
            var self = this
              , selectableParents = []
              , allParents = ns.editables.getParent(editable, true);
            allParents.forEach(function(e) {
                if (self.isDesignable(e))
                    selectableParents.push(e)
            });
            return selectableParents
        },
        openDesignDialog: function(editable) {
            ns.DialogFrame.openDialog(new ns.design.Dialog(editable))
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.design.Dialog = ns.util.extendClass(ns.edit.Dialog, {
        getConfig: function() {
            var config = {
                src: this.editable.config.designDialogSrc,
                loadingMode: this.editable.config.designDialogLoadingMode,
                layout: this.editable.config.designDialogLayout || "auto"
            };
            if (ns.pageInfo.editableTemplate && config.src.indexOf("/_cq_design_dialog") > -1 || config.src.indexOf("/cq:design_dialog") > -1) {
                config.layout = "fullscreen";
                config.fullscreenToggle = false
            }
            return config
        },
        onSuccess: function() {
            ns.ContentFrame.reload()
        },
        onOpen: function() {},
        onClose: function() {}
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.design.Overlay = function(editable, container) {
        ns.design.Overlay.super_.constructor.call(this, editable, container)
    }
    ;
    ns.util.inherits(ns.design.Overlay, ns.ui.Overlay);
    ns.design.Overlay.prototype.render = function(editable, container) {
        var dom = ns.design.Overlay.super_.render.apply(this, arguments);
        if (ns.design.isDesignable(editable) || ns.design.getSelectableParents(editable).length)
            dom.removeClass("is-disabled");
        else
            dom.addClass("is-disabled");
        return dom
    }
    ;
    ns.design.Overlay.prototype.position = function(editable, parent) {
        ns.design.Overlay.super_.position.apply(this, arguments)
    }
    ;
    ns.design.Overlay.prototype.remove = function() {
        ns.design.Overlay.super_.remove.apply(this, arguments)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.design.ToolbarActions = {};
    Object.defineProperty(ns.design, "Actions", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.design.ToolbarActions instead");
            return ns.design.ToolbarActions
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.design.ToolbarActions instead");
            ns.design.ToolbarActions = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.design.ToolbarActions.CONFIGURE = new ns.ui.ToolbarAction({
        icon: "wrench",
        text: Granite.I18n.get("Configure"),
        execute: function configureDesign(editable, param, target) {
            ns.design.openDesignDialog(editable);
            return false
        },
        condition: function(editable) {
            return ns.design.isDesignable(editable) && !!editable.config.designDialogSrc
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.design.ToolbarActions.PARENT = new ns.ui.ToolbarAction({
        icon: "selectContainer",
        text: Granite.I18n.get("Parent"),
        execute: function getParent(editable, param, target) {
            target.addClass("is-active");
            var selectableParents = ns.design.getSelectableParents(editable);
            ns.edit.ToolbarActions.PARENT.execute(editable, selectableParents, target);
            return false
        },
        condition: function(editable) {
            return !!ns.design.getSelectableParents(editable).length
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.design.Toolbar = ns.util.extendClass(ns.ui.Toolbar, {});
    Object.defineProperty(ns.design.Toolbar, "defaultActions", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.design.ToolbarActions instead");
            return ns.design.ToolbarActions
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.design.ToolbarActions instead");
            ns.design.ToolbarActions = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.design.CONFIG = $.extend({}, ns.edit.CONFIG, {
        name: "Design",
        icon: "edit",
        title: Granite.I18n.get("Design", "title of authoring layer"),
        toolbarConstructor: ns.design.Toolbar,
        overlayConstructor: ns.design.Overlay,
        toolbarActions: ns.design.ToolbarActions
    });
    ns.design.Layer = ns.util.extendClass(ns.edit.Layer, {
        config: ns.design.CONFIG,
        isAvailable: function() {
            return ns.pageInfoHelper && ns.pageInfoHelper.isDesignable() && !ns.pageInfoHelper.hasEditableTemplate()
        },
        setUp: function() {
            ns.ui.dropController.disable({
                general: true
            });
            ns.ui.SidePanel.toggleTab(ns.ui.SidePanel.TAB_CLASSES.COMPONENTS, false)
        },
        tearDown: function() {
            ns.ui.dropController.enable({
                general: true
            });
            ns.ui.SidePanel.toggleTab(ns.ui.SidePanel.TAB_CLASSES.COMPONENTS, true)
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.developer = {};
    ns.developer.getScriptPath = function(inspectable) {
        if (inspectable && inspectable.config.servlet) {
            result = inspectable.config.servlet.match("Script (.*)");
            if (result && result.length == 2)
                return result[1]
        }
        return null
    }
    ;
    ns.developer.setupEditLink = function($a, path) {
        if (!ns.developer.editorUrlTemplate || ns.developer.editorUrlTemplate == "")
            ns.developer.editorUrlTemplate = "/crx/de/index.jsp#{filepath}";
        if (!path) {
            $a.attr("href", "#");
            $a.removeAttr("target");
            return
        }
        path = path.replace(/:/g, "%3A");
        var href = ns.developer.editorUrlTemplate;
        href = href.replace(/\{filepath}/g, path);
        href = href.replace(/\{instanceId}/g, ns.developer.instanceId);
        href = Granite.HTTP.externalize(href);
        $a.attr("href", href);
        if (href.match(/^((http)|(\/)).*/))
            $a.attr("target", "_blank");
        else
            $a.removeAttr("target")
    }
    ;
    ns.developer.getComponentDetailsListItem = function(path, shortForm) {
        var $link = $("\x3ca class\x3d'coral-Link'\x3e\x3c/a\x3e");
        ns.developer.setupEditLink($link, path);
        $link.attr("title", path);
        if (shortForm)
            $link.text(path.substr(path.lastIndexOf("/") + 1));
        else
            $link.text(path);
        return $("\x3cli class\x3d'cq-DeveloperRail-detailsSectionContentListItem'/\x3e").append($link)
    }
    ;
    ns.developer.loadScriptList = function(inspectable, $scriptsList) {
        return $.ajax({
            type: "GET",
            url: Granite.HTTP.externalize("/bin/componentscripts?resourceType\x3d" + inspectable.type),
            dataType: "json"
        }).then(function(res) {
            var i;
            $scriptsList.empty();
            for (i = 0; i < res.length; i++)
                $scriptsList.append(ns.developer.getComponentDetailsListItem(res[i], true))
        }).fail(function() {
            $scriptsList.empty();
            $scriptsList.append($("\x3cli\x3e\x3cp\x3e" + Granite.I18n.get("error fetching scripts") + "\x3c/p\x3e\x3c/li\x3e"))
        })
    }
    ;
    ns.developer.findInspectables = function() {
        var $nodes;
        var inspectables = [];
        $nodes = $("#ContentFrame").contents();
        $nodes = $nodes.add($nodes.find("*:not(iframe)"));
        $nodes = $nodes.contents();
        var $commentNodes = $nodes.filter(function() {
            return this.nodeType == 8 && this.nodeValue && this.nodeValue.match(/cq\{/)
        });
        var $cqNodes = $nodes.find("cq");
        $commentNodes.each(function(i, comment) {
            var config = $.parseJSON(decodeText(comment.nodeValue.substring(2)));
            var $cqNode = $cqNodes.filter("[data-path\x3d'" + config.path + "']");
            var $dom = $cqNode.parent();
            if (!$cqNode.length) {
                var tmpDom = $(comment)[0].previousSibling;
                if (tmpDom) {
                    while (tmpDom && (tmpDom.nodeType === 3 && tmpDom.textContent.trim().length === 0 || tmpDom.nodeValue && tmpDom.nodeValue.match(/cq\{/)))
                        tmpDom = tmpDom.previousSibling;
                    $dom = $(tmpDom)
                } else
                    $dom = $(comment).prev()
            }
            inspectables.push(new ns.Inspectable(config,$dom))
        });
        return inspectables
    }
    ;
    var decoderElement = document.createElement("div");
    function decodeText(encodedText) {
        decoderElement.innerHTML = encodedText;
        return decoderElement.textContent
    }
    ns.developer.getRailContentHeight = function() {
        var $tabTitle = $(".cq-DeveloperRail").find(".sidepanel-tab-title:visible");
        var $tabContent = $(".cq-DeveloperRail").find(".content-panel:visible");
        return $("body").height() - $tabTitle.outerHeight(true) - parseInt($tabContent.css("margin-top"), 10) - parseInt($tabContent.css("padding-top"), 10)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.developer.componentTree = function() {
        var self = {};
        function updateTimer(timer, time) {
            if (time > 100)
                timer.color = Coral.Tag.color.ORANGE;
            else if (time > 25)
                timer.color = Coral.Tag.color.YELLOW;
            timer.label.innerHTML = time < 100 ? time + "ms" : (time / 1E3).toFixed(2) + "s"
        }
        function buildComponentActions(wrapper, inspectable) {
            var scriptPath = ns.developer.getScriptPath(inspectable);
            var winMode = ns.util.getWinMode();
            var components = ns.components.find({
                "resourceType": inspectable.type
            });
            var componentDetailsHref = components.length ? Granite.URITemplate.expand(self.componentDetailsURITemplate, {
                path: components[0].getPath()
            }) : undefined;
            var detailsButton = (new Coral.Button).set({
                variant: "minimal",
                icon: "copy",
                title: Granite.I18n.get("View Details")
            });
            var editButton = (new Coral.AnchorButton).set({
                variant: "minimal",
                icon: "edit",
                title: Granite.I18n.get("Edit Script")
            });
            var componentDetailsButton = null;
            if (componentDetailsHref)
                componentDetailsButton = (new Coral.AnchorButton).set({
                    variant: "minimal",
                    icon: "viewGrid",
                    href: componentDetailsHref,
                    target: winMode === "single" ? "_self" : "_blank",
                    title: Granite.I18n.get("View Component Details")
                });
            detailsButton.classList.add("js-details-activator");
            $(detailsButton).data("inspectable", inspectable);
            ns.developer.setupEditLink($(editButton), scriptPath);
            $(wrapper).append([detailsButton, editButton, componentDetailsButton]);
            if (inspectable.config["exception"] != undefined) {
                var errorReportButton = (new Coral.Button).set({
                    variant: "minimal",
                    icon: "alert",
                    title: Granite.I18n.get("View Error Report")
                });
                errorReportButton.classList.add("is-error", "js-errors-activator");
                $(errorReportButton).data("inspectable", inspectable);
                wrapper.appendChild(errorReportButton)
            }
        }
        function buildItem(parent, inspectable, isRoot) {
            var children = ns.editables.getChildren(inspectable);
            var accordion = new Coral.Accordion;
            var accordionItem = new Coral.Accordion.Item;
            var label = document.createDocumentFragment();
            accordion.variant = "large";
            accordion.classList.add("cq-Tree-item");
            $(accordion).data("inspectable", inspectable);
            accordion.dataset.path = inspectable.path;
            accordion.dataset.type = inspectable.type;
            $(accordion).on("click", "coral-accordion-item", function() {
                var inspectable = $(this).closest("coral-accordion").data("inspectable");
                ns.selection.deactivateCurrent();
                ns.selection.deselectAll();
                if (inspectable)
                    ns.selection.select(inspectable)
            });
            label.appendChild(document.createTextNode(inspectable.getResourceTypeName()));
            if (children.length > 0) {
                var childCount = $("\x3cspan class\x3d'cq-Tree-itemChildCount'\x3e(" + children.length + ")\x3c/span\x3e")[0];
                label.appendChild(childCount)
            }
            if (inspectable.config["totalTime"] != undefined) {
                var totalTimeTimer = new Coral.Tag;
                totalTimeTimer.classList.add("js-timer");
                totalTimeTimer.size = Coral.Tag.size.LARGE;
                updateTimer(totalTimeTimer, inspectable.config["totalTime"]);
                label.appendChild(totalTimeTimer)
            }
            accordionItem.label.appendChild(label);
            var actionsWrapper = $("\x3cdiv class\x3d'cq-DeveloperRail-componentActions'\x3e\x3c/div\x3e")[0];
            buildComponentActions(actionsWrapper, inspectable);
            accordionItem.content.appendChild(actionsWrapper);
            if (children.length > 0 && inspectable.config["selfTime"] != undefined) {
                var selfTimeTimer = new Coral.Tag;
                selfTimeTimer.classList.add("js-timer");
                selfTimeTimer.size = Coral.Tag.size.LARGE;
                updateTimer(selfTimeTimer, inspectable.config["selfTime"]);
                actionsWrapper.appendChild(selfTimeTimer)
            }
            buildLevel(accordionItem.content, children);
            accordion.items.add(accordionItem);
            if (isRoot)
                accordionItem.selected = true;
            parent.appendChild(accordion)
        }
        function buildLevel(parent, inspectables) {
            if (inspectables.length > 0) {
                var level = $("\x3cdiv class\x3d'cq-Tree-level'\x3e\x3c/div\x3e")[0];
                for (var i = 0; i < inspectables.length; i++)
                    buildItem(level, inspectables[i], false);
                parent.appendChild(level)
            }
        }
        function updateSelection() {
            self.$componentTree.find("coral-accordion").each(function(index, value) {
                $(this).find("coral-accordion-item")[0].selected = false
            });
            self.$componentTree.find("coral-accordion").each(function(index, value) {
                var inspectable = $(this).data("inspectable");
                if (inspectable && inspectable.overlay && inspectable.overlay.isSelected()) {
                    var item = $(this).find("coral-accordion-item")[0];
                    $(this).parents("coral-accordion").each(function(index, ancestor) {
                        $(ancestor).find("coral-accordion-item")[0].selected = true;
                        if (ancestor.items.length)
                            ancestor.items.first().open = true
                    });
                    item.selected = true;
                    item.focus()
                }
            })
        }
        self.onSelectionChanged = function() {
            updateSelection()
        }
        ;
        self.showPanel = function(panel) {
            self.$componentTree.toggle(self.$componentTree.hasClass(panel));
            self.$componentDetails.toggle(self.$componentDetails.hasClass(panel));
            self.$errorDetails.toggle(self.$errorDetails.hasClass(panel))
        }
        ;
        self.build = function() {
            var modelRoot = ns.editables.getRoot();
            self.$componentTree.empty();
            if (modelRoot)
                buildItem(self.$componentTree[0], modelRoot, true);
            else
                self.$componentTree.append($("\x3cdiv class\x3d'cq-Tree-item u-emptyMessage'/\x3e").text(Granite.I18n.get("No component info loaded.")));
            var tabview = $(".cq-DeveloperRail").find("coral-tabview")[0];
            Coral.commons.ready(tabview, function() {
                self.$componentInspector.height(ns.developer.getRailContentHeight())
            });
            channel.on("cq-sidepanel-resized", function() {
                self.$componentInspector.height(ns.developer.getRailContentHeight())
            });
            $(window).on("resize", function() {
                self.$componentInspector.height(ns.developer.getRailContentHeight())
            })
        }
        ;
        self.updateComponentDetails = function(inspectable) {
            var $title = self.$componentDetails.find(".js-component-title");
            var timer = self.$componentDetails.find(".js-timer")[0];
            var $scriptsList = self.$componentDetails.find(".js-scripts-list");
            var $contentList = self.$componentDetails.find(".js-content-list");
            $title.text(inspectable.getResourceTypeName());
            updateTimer(timer, inspectable.config["selfTime"]);
            $scriptsList.empty().append($("\x3ccoral-wait /\x3e"));
            ns.developer.loadScriptList(inspectable, $scriptsList);
            $contentList.empty().append(ns.developer.getComponentDetailsListItem(inspectable.path))
        }
        ;
        self.updateErrorDetails = function(inspectable) {
            var $title = self.$errorDetails.find(".js-component-title");
            var timer = self.$errorDetails.find(".js-timer")[0];
            var $exception = self.$errorDetails.find(".js-exception");
            var $requestProgress = self.$errorDetails.find(".js-request-progress");
            $title.text(inspectable.getResourceTypeName());
            updateTimer(timer, inspectable.config["selfTime"]);
            $exception.text(inspectable.config["exception"]);
            $requestProgress.text(inspectable.config["requestProgress"])
        }
        ;
        self.tearDown = function() {
            self.$componentTree.empty()
        }
        ;
        channel.on("foundation-contentloaded", function(event) {
            var $developerSidePanel = $(event.target).find(".js-SidePanel-content--developer");
            if ($developerSidePanel.length) {
                self.$componentInspector = $developerSidePanel.find("#ComponentInspector");
                self.$componentTreeOld = self.$componentInspector.find(".js-component-tree-old");
                self.$componentTree = self.$componentInspector.find(".js-component-tree");
                self.$componentDetails = self.$componentInspector.find(".js-component-details");
                self.$errorDetails = self.$componentInspector.find(".js-error-details");
                self.componentDetailsURITemplate = self.$componentInspector.data("component-details-uritemplate");
                self.showPanel("js-component-tree")
            }
        });
        channel.on("click", "#ComponentInspector .js-component-tree-activator", function(event) {
            self.showPanel("js-component-tree")
        });
        channel.on("click", "#ComponentInspector .js-details-activator", function(event) {
            var inspectable = $(this).data("inspectable");
            ns.developer.componentTree.updateComponentDetails(inspectable);
            ns.developer.componentTree.showPanel("js-component-details")
        });
        channel.on("click", "#ComponentInspector .js-errors-activator", function(event) {
            var inspectable = $(this).data("inspectable");
            ns.developer.componentTree.updateErrorDetails(inspectable);
            ns.developer.componentTree.showPanel("js-error-details")
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.developer.errorList = function() {
        var self = {
            count: 0
        };
        function walkTree($list, inspectable) {
            var children = ns.editables.getChildren(inspectable), $item, $title, detailsIcon;
            if (inspectable.config["exception"] != undefined) {
                $item = $("\x3cdiv class\x3d'cq-DeveloperRail-listItem js-error-details-activator'/\x3e").data("inspectable", inspectable);
                detailsIcon = new Coral.Icon;
                detailsIcon.set({
                    icon: "chevronRight",
                    size: Coral.Icon.size.EXTRA_SMALL,
                    title: Granite.I18n.get("View Details")
                });
                detailsIcon.classList.add("u-coral-pullRight");
                $item.append(detailsIcon);
                $title = $("\x3cspan class\x3d'js-component-title'/\x3e").text(inspectable.getResourceTypeName());
                $item.append($title);
                $list.append($item);
                self.count++
            }
            if (children.length > 0)
                for (var i = 0; i < children.length; i++)
                    walkTree($list, children[i])
        }
        function updateRailSwitcherIcon(hasErrors) {
            var $icon = $("#developer-rail").find("coral-tab.js-errors-list-activator");
            if (hasErrors)
                $icon.addClass("is-error");
            else
                $icon.removeClass("is-error")
        }
        self.showPanel = function(panel) {
            self.$errorList.toggle(self.$errorList.hasClass(panel));
            self.$errorDetails.toggle(self.$errorDetails.hasClass(panel));
            self.$componentDetails.toggle(self.$componentDetails.hasClass(panel))
        }
        ;
        self.build = function() {
            var root = ns.editables.getRoot();
            self.$errorList.empty();
            if (root)
                walkTree(self.$errorList, root);
            if (self.count > 0)
                updateRailSwitcherIcon(true);
            else {
                self.$errorList.append($("\x3cdiv class\x3d'cq-DeveloperRail-detailsSection u-emptyMessage'/\x3e").text(Granite.I18n.get("No errors reported.")));
                updateRailSwitcherIcon(false)
            }
            var tabview = $(".cq-DeveloperRail").find("coral-tabview")[0];
            Coral.commons.ready(tabview, function() {
                self.$errorInspector.height(ns.developer.getRailContentHeight())
            });
            channel.on("cq-sidepanel-resized", function() {
                self.$errorInspector.height(ns.developer.getRailContentHeight())
            });
            $(window).on("resize", function() {
                self.$errorInspector.height(ns.developer.getRailContentHeight())
            })
        }
        ;
        self.updateErrorDetails = function(inspectable) {
            var $title = self.$errorDetails.find(".js-component-title")
              , $detailsLink = self.$errorDetails.find(".js-component-details-activator")
              , $editLink = self.$errorDetails.find(".js-edit-activator")
              , $exception = self.$errorDetails.find(".js-exception")
              , $requestProgress = self.$errorDetails.find(".js-request-progress");
            $title.text(inspectable.getResourceTypeName());
            $detailsLink.data("inspectable", inspectable);
            ns.developer.setupEditLink($editLink, ns.developer.getScriptPath(inspectable));
            $exception.text(inspectable.config["exception"]);
            $requestProgress.text(inspectable.config["requestProgress"])
        }
        ;
        self.updateComponentDetails = function(inspectable) {
            var $title = self.$componentDetails.find(".js-component-title")
              , $scriptsList = self.$componentDetails.find(".js-scripts-list")
              , $contentList = self.$componentDetails.find(".js-content-list");
            $title.text(inspectable.getResourceTypeName());
            $scriptsList.empty().append($("\x3ccoral-wait /\x3e"));
            ns.developer.loadScriptList(inspectable, $scriptsList);
            $contentList.empty().append(ns.developer.getComponentDetailsListItem(inspectable.path))
        }
        ;
        self.tearDown = function() {
            self.$errorList.children().remove()
        }
        ;
        channel.on("foundation-contentloaded", function(event) {
            var target = $(event.target).find(".js-SidePanel-content--developer");
            if (target.length) {
                self.$errorInspector = target.find("#ErrorInspector");
                self.$errorList = self.$errorInspector.find(".js-error-list");
                self.$errorDetails = self.$errorInspector.find(".js-error-details");
                self.$componentDetails = self.$errorInspector.find(".js-component-details");
                self.showPanel("js-error-list")
            }
        });
        channel.on("click", "#ErrorInspector .js-error-details-activator", function(e) {
            var inspectable = $(this).data("inspectable");
            ns.developer.errorList.updateErrorDetails(inspectable);
            ns.developer.errorList.showPanel("js-error-details")
        });
        channel.on("click", "#ErrorInspector .js-error-details .js-component-details-activator", function(e) {
            var inspectable = $(this).data("inspectable");
            ns.developer.errorList.updateComponentDetails(inspectable);
            ns.developer.errorList.showPanel("js-component-details")
        });
        channel.on("click", "#ErrorInspector .js-error-list-activator", function(e) {
            self.showPanel("js-error-list")
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function setUpSidePanel() {
        ns.ui.SidePanel.loadContent({
            selector: ".js-SidePanel-content--developer",
            path: "/libs/wcm/core/content/editor/jcr:content/sidepanels/developer.html"
        }).then(function() {
            ns.ui.SidePanel.showContent("js-SidePanel-content--developer");
            ns.developer.componentTree.build();
            ns.developer.errorList.build();
            ns.ui.SidePanel.open(true)
        });
        channel.on("cq-interaction-focus.developer", function(event) {
            ns.developer.componentTree.onSelectionChanged()
        })
    }
    function tearDownSidePanel() {
        channel.off("cq-interaction-focus.developer");
        ns.developer.componentTree.tearDown();
        ns.developer.errorList.tearDown()
    }
    ns.developer.CONFIG = {
        name: "Developer",
        icon: "code",
        title: Granite.I18n.get("Developer", "title of authoring layer"),
        overlayConstructor: ns.ui.Overlay,
        sidePanel: {
            setUp: setUpSidePanel,
            tearDown: tearDownSidePanel
        },
        findEditables: ns.developer.findInspectables,
        interactions: {
            onOverlayHover: ns.edit.Interactions.onOverlayHover,
            onOverlayClick: ns.edit.Interactions.onOverlayClick,
            onOutsideOverlayClick: ns.edit.Interactions.onOutsideOverlayClick
        }
    };
    ns.developer.Layer = ns.util.extendClass(ns.Layer, {
        constructor: function() {
            ns.developer.Layer.super_.constructor.call(this, ns.developer.CONFIG)
        },
        isAvailable: function() {
            return ns.pageInfoHelper && ns.pageInfoHelper.isDeveloper()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var emulatorVisible = false;
    ns.ScaffoldingLayer = function(name, icon, title) {
        name = name || "Scaffolding";
        icon = icon || "textLeft";
        title = title || Granite.I18n.get("Scaffolding", "title of authoring layer");
        ns.ScaffoldingLayer.super_.constructor.call(this, name, icon, title)
    }
    ;
    ns.util.inherits(ns.ScaffoldingLayer, ns.Layer);
    ns.ScaffoldingLayer.prototype.isAvailable = function() {
        if (!ns.pageInfo)
            return false;
        if (false === ns.pageInfo.scaffoldingEnabled)
            return false;
        if (ns.pageInfo.permissions)
            return !!ns.pageInfo.permissions.modify;
        return false
    }
    ;
    ns.ScaffoldingLayer.prototype.setUp = function() {
        ns.ui.globalBar.emulatorTrigger.disabled = true;
        emulatorVisible = ns.ui.emulator.isVisible();
        ns.ui.emulator.toggle(false);
        ns.ContentFrame.showFullScreenMask(false);
        ns.ui.SidePanel.showContent("js-SidePanel-content--edit");
        ns.history.Manager.setEnabled(true)
    }
    ;
    ns.ScaffoldingLayer.prototype.tearDown = function() {
        ns.selection.deselectAll();
        ns.DialogFrame.closeDialog();
        ns.history.Manager.setEnabled(false);
        if (emulatorVisible)
            ns.ui.emulator.toggle(emulatorVisible)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function setWcmModeCookie() {
        if ($.cookie("wcmmode") !== "preview") {
            $.cookie("wcmmode", "preview", {
                path: "/"
            });
            channel.trigger("editor-frame-mode-changed")
        }
    }
    ns.PreviewLayer = ns.util.extendClass(ns.Layer, {
        config: {
            name: "Preview",
            icon: "viewOn",
            title: Granite.I18n.get("Preview", "title of authoring layer")
        },
        constructor: function PreviewLayer(config) {
            this.hidden = true;
            ns.PreviewLayer.super_.constructor.apply(this, Array.prototype.slice.call(arguments))
        },
        setUp: function() {
            setWcmModeCookie();
            ns.ContentFrame.showFullScreenMask(false);
            ns.ContentFrame.showPlaceholder(false);
            ns.OverlayWrapper.hide();
            ns.ui.SidePanel.close(true);
            ns.ui.SidePanel.showEmptyContent()
        },
        tearDown: function() {
            ns.ContentFrame.showFullScreenMask(true);
            ns.ContentFrame.showPlaceholder(true);
            ns.OverlayWrapper.show()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var RESPONSIVE_COLUMNS_DEFAULT = 12;
    var BREAKPOINT_DEFAULT_NAME = "default";
    var RESPONSIVE_OFFSET_DEFAULT = 0;
    var RESPONSIVE_BEHAVIOR_NONE = "none";
    var currentBreakpoint;
    function isNumeric(val) {
        return !isNaN(parseFloat(val)) && isFinite(val)
    }
    function adaptResponsiveColumnDimensions(editable) {
        var parent = !getLegacyResponsiveBehaviour(editable) && getClosestResponsiveParent(editable) || ns.editables.getParent(editable);
        var responsiveCfg = editable.config.responsive;
        if (!ns.responsive.isResponsive(editable))
            return;
        for (var bp in responsiveCfg) {
            var columns = parseInt(ns.editableHelper.getStyleProperty(parent, "columns", true) || RESPONSIVE_COLUMNS_DEFAULT);
            var width = responsiveCfg[bp] && responsiveCfg[bp].width && parseInt(responsiveCfg[bp].width) || columns || RESPONSIVE_COLUMNS_DEFAULT;
            var offset = responsiveCfg[bp] && responsiveCfg[bp].offset && parseInt(responsiveCfg[bp].offset) || RESPONSIVE_OFFSET_DEFAULT;
            if (columns && width + offset > columns)
                if (width > columns) {
                    width = columns;
                    offset = 0
                } else
                    width = columns - offset;
            if (responsiveCfg[bp].width)
                responsiveCfg[bp].width = width;
            if (responsiveCfg[bp].offset)
                responsiveCfg[bp].offset = offset
        }
    }
    function getClosestResponsiveParent(editable) {
        var parent = ns.editables.getParent(editable);
        if (!parent)
            return;
        if (parent.config && parent.config.responsive)
            return parent;
        return getClosestResponsiveParent(parent)
    }
    function getLegacyResponsiveBehaviour(editable) {
        if (editable && editable.config && editable.config["cq:useLegacyResponsiveBehaviour"] === true)
            return true;
        return false
    }
    function getResponsiveCssClasses(editable, asString) {
        var responsiveCfg = editable.config.responsive;
        var cssClasses = [];
        var parent = !getLegacyResponsiveBehaviour(editable) && getClosestResponsiveParent(editable) || ns.editables.getParent(editable);
        var parentResponsiveCfg;
        if (parent && parent.config && parent.config.responsive)
            parentResponsiveCfg = parent.config.responsive;
        if (ns.responsive.isResponsive(editable)) {
            cssClasses.push(ns.responsive.DEFAULT_COLUMN_CSS_CLASS);
            if (responsiveCfg)
                for (var bp in responsiveCfg) {
                    var columnBreakpoint = responsiveCfg[bp];
                    var width = columnBreakpoint.width;
                    var offset = columnBreakpoint.offset || RESPONSIVE_OFFSET_DEFAULT;
                    var behavior = columnBreakpoint.behavior || RESPONSIVE_BEHAVIOR_NONE;
                    if (!width)
                        continue;
                    if (parentResponsiveCfg) {
                        var gridBreakpoint = parentResponsiveCfg[bp];
                        if (gridBreakpoint && (!gridBreakpoint.width || gridBreakpoint.width === "0"))
                            gridBreakpoint.width = RESPONSIVE_COLUMNS_DEFAULT;
                        if (gridBreakpoint && width + offset > gridBreakpoint.width)
                            if (width > gridBreakpoint.width) {
                                width = gridBreakpoint.width;
                                offset = 0
                            } else if (offset < gridBreakpoint.width)
                                width = gridBreakpoint.width - offset;
                            else
                                offset = 0
                    }
                    if (width)
                        cssClasses.push(ns.responsive.DEFAULT_COLUMN_CSS_CLASS + "--" + bp + "--" + width);
                    cssClasses.push(ns.responsive.DEFAULT_COLUMN_CSS_CLASS + "--offset--" + bp + "--" + offset);
                    cssClasses.push(ns.responsive.DEFAULT_COLUMN_CSS_CLASS + "--" + bp + "--" + behavior)
                }
            else {
                var fallbackDefaultWidth = RESPONSIVE_COLUMNS_DEFAULT;
                if (!getLegacyResponsiveBehaviour(editable) && parentResponsiveCfg && parentResponsiveCfg[BREAKPOINT_DEFAULT_NAME])
                    fallbackDefaultWidth = parentResponsiveCfg[BREAKPOINT_DEFAULT_NAME]["width"] || fallbackDefaultWidth;
                cssClasses.push(ns.responsive.DEFAULT_COLUMN_CSS_CLASS + "--" + BREAKPOINT_DEFAULT_NAME + "--" + fallbackDefaultWidth)
            }
        }
        if (!asString)
            return cssClasses;
        return cssClasses.join(" ")
    }
    function setResponsiveParentCssClasses(editable) {
        var parent = ns.editables.getParent(editable);
        var responsiveCfg = editable.config.responsive;
        var gridCssClassPrefix = ns.responsive.DEFAULT_CSS_PREFIX;
        var cssClasses = {};
        if (!parent)
            return;
        if (responsiveCfg && ns.responsive.isResponsiveGrid(parent)) {
            for (var bp in responsiveCfg) {
                var columns = ns.editableHelper.getStyleProperty(parent, "columns", true);
                var key = gridCssClassPrefix + "--" + bp + "--";
                var parentConfigWidth = parent.config && parent.config.responsive && parent.config.responsive[bp] && parseInt(parent.config.responsive[bp].width, 10);
                var defaultConfigWidth = parent.config && parent.config.responsive && parent.config.responsive[BREAKPOINT_DEFAULT_NAME] && parseInt(parent.config.responsive[BREAKPOINT_DEFAULT_NAME].width, 10);
                var width = columns || parentConfigWidth || defaultConfigWidth || RESPONSIVE_COLUMNS_DEFAULT;
                cssClasses[key] = key + width
            }
            var gridDom = parent.dom[0].querySelector("." + gridCssClassPrefix);
            if (!gridDom)
                return;
            for (var key in cssClasses)
                if (cssClasses.hasOwnProperty(key)) {
                    var found = false;
                    for (var i = 0, length = gridDom.classList.length; i < length; i++)
                        if (gridDom.classList[i].indexOf(key) === 0) {
                            found = true;
                            break
                        }
                    if (!found)
                        gridDom.classList.add(cssClasses[key])
                }
        }
    }
    function clearResponsiveColumnCssClasses(element) {
        var oldGridClasses = [];
        for (var i = 0; i < element.classList.length; i++) {
            var className = element.classList[i];
            if (className.indexOf(ns.responsive.DEFAULT_COLUMN_CSS_CLASS) === 0)
                oldGridClasses.push(className)
        }
        if (oldGridClasses.length > 0)
            element.classList.remove.apply(element.classList, oldGridClasses)
    }
    ns.responsive = {
        NN_RESPONSIVE: "cq:responsive",
        DEFAULT_CSS_PREFIX: "aem-Grid",
        DEFAULT_COLUMN_CSS_CLASS: "aem-GridColumn",
        isResponsiveGrid: function(editable) {
            return editable && editable.config && editable.config.isResponsiveGrid
        },
        isInResponsiveGrid: function(editable) {
            var parent = ns.editables.getParent(editable);
            if (parent && this.isResponsiveGrid(parent))
                return true;
            return false
        },
        isResponsive: function(editable) {
            if (!editable)
                return false;
            if (editable.config && editable.config.responsive)
                return true;
            var parent = ns.editables.getParent(editable);
            if (parent)
                return parent && ns.responsive.isResponsiveGrid(parent);
            return editable.dom && editable.dom.hasClass(ns.responsive.DEFAULT_COLUMN_CSS_CLASS)
        },
        refresh: function(editable) {
            if (ns.responsive.isResponsive(editable)) {
                var parent = ns.editables.getParent(editable);
                if (parent && ns.responsive.isResponsiveGrid(parent)) {
                    var columnNode = ns.ContentFrame.getEditableNode(editable.path)[0];
                    if (columnNode) {
                        ns.responsive.updateDom(editable, columnNode);
                        ns.overlayManager.recreate(editable)
                    }
                }
            }
        },
        updateDom: function(editable, newDomElement) {
            adaptResponsiveColumnDimensions(editable);
            var classNames = getResponsiveCssClasses(editable);
            if (classNames && classNames.length > 0) {
                clearResponsiveColumnCssClasses(newDomElement);
                newDomElement.classList.add.apply(newDomElement.classList, classNames)
            }
            setResponsiveParentCssClasses(editable)
        },
        getResponsiveCssClasses: function(editable) {
            Granite.author.util.deprecated();
            return getResponsiveCssClasses(editable).join(" ")
        },
        getHiddenChildren: function(editable, breakpoint) {
            var bp = breakpoint || this.getCurrentBreakpoint()
              , children = ns.editables.getChildren(editable)
              , hiddenChildren = [];
            children.forEach(function(child) {
                if (child.config.responsive) {
                    var responsiveCfg = child.config.responsive[bp] || child.config.responsive[BREAKPOINT_DEFAULT_NAME];
                    if (responsiveCfg && responsiveCfg.behavior === "hide")
                        hiddenChildren.push(child)
                }
            });
            return hiddenChildren
        },
        getResponsiveConfig: function(editable, breakpointName) {
            return editable.config.responsive && editable.config.responsive[breakpointName] ? editable.config.responsive[breakpointName] : {}
        },
        getCurrentResponsiveConfig: function(editable) {
            return this.getResponsiveConfig(editable, this.getCurrentBreakpoint())
        },
        getCurrentResponsiveBehavior: function(editable) {
            var bp = this.getCurrentResponsiveConfig(editable);
            return bp.behavior || "none"
        },
        getCurrentBreakpoint: function() {
            return currentBreakpoint || "default"
        },
        setCurrentBreakpoint: function(breakpoint) {
            currentBreakpoint = breakpoint
        },
        setDeviceBreakpoint: function(deviceWidth) {
            this.setCurrentBreakpoint(this.getDeviceBreakpoint(deviceWidth))
        },
        getDeviceBreakpoint: function(deviceWidth) {
            var cfg = this.getBreakpoints(), closestBp;
            for (var bp in cfg)
                if (cfg[bp].width > deviceWidth && (!closestBp || cfg[bp].width <= cfg[closestBp].width))
                    closestBp = bp;
            return closestBp
        },
        getBreakpoint: function(name) {
            var cfg = this.getBreakpoints();
            return cfg[name]
        },
        getBreakpoints: function() {
            if (ns.pageInfo.responsive && ns.pageInfo.responsive.breakpoints)
                return ns.pageInfo.responsive.breakpoints;
            return {}
        },
        getOrderedBreakpoints: function() {
            var cfg = this.getBreakpoints()
              , ret = [];
            for (var bp in cfg)
                ret.push(bp);
            ret.sort(function(a, b) {
                if (cfg[a].width < cfg[b].width)
                    return -1;
                if (cfg[a].width > cfg[b].width)
                    return 1;
                return 0
            });
            ret.push("default");
            return ret
        },
        getGridWidth: function(gridEditable) {
            var col = ns.editableHelper.getStyleProperty(gridEditable, "columns");
            if (isNumeric(col))
                return col;
            var parent = getClosestResponsiveParent(gridEditable);
            col = getGridWidthFromResponsiveConfig.call(this, gridEditable, parent);
            return parseInt(col, 10) || parseInt(RESPONSIVE_COLUMNS_DEFAULT, 10);
            function getGridWidthFromResponsiveConfig(gridEditable, parent) {
                var col;
                if (gridEditable.config.responsive)
                    col = getCurrentBreakpointOrDefaultFrom.call(this, gridEditable);
                else if (!getLegacyResponsiveBehaviour(gridEditable) && parent && parent.config && parent.config.responsive)
                    col = getCurrentBreakpointOrDefaultFrom.call(this, parent);
                return col
            }
            function getCurrentBreakpointOrDefaultFrom(editable) {
                var col;
                if (editable.config.responsive[this.getCurrentBreakpoint()])
                    col = editable.config.responsive[this.getCurrentBreakpoint()].width;
                else if (editable.config.responsive["default"])
                    col = editable.config.responsive["default"].width;
                return parseInt(col, 10) || parseInt(RESPONSIVE_COLUMNS_DEFAULT, 10)
            }
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.responsive.persistence = {
        createResponsiveConfig: function(editable) {
            var responsiveNode = new ns.persistence.PostRequest;
            return responsiveNode.setURL(editable.path + "/" + ns.responsive.NN_RESPONSIVE).send()
        },
        setBreakpointConfig: function(editable, breakpoint, cfg) {
            var responsivegridEditable = ns.editables.getParent(editable)
              , properties = {};
            properties[ns.responsive.NN_RESPONSIVE] = {};
            properties[ns.responsive.NN_RESPONSIVE][breakpoint] = cfg;
            function updateFunction() {
                var responsiveNode = new ns.persistence.PostRequest
                  , url = editable.path + "/" + ns.responsive.NN_RESPONSIVE + "/" + breakpoint;
                return responsiveNode.setURL(url).setParams(cfg).send().then(function() {
                    editable.afterEdit();
                    responsivegridEditable && responsivegridEditable.afterChildEdit(editable)
                })
            }
            if (editable.beforeEdit(updateFunction, properties) === false || responsivegridEditable && responsivegridEditable.beforeChildEdit(updateFunction, properties, editable) === false)
                return $.Deferred().reject().promise();
            else
                return updateFunction()
        },
        refreshGrid: function(editable, config) {
            Granite.author.util.deprecated("Use Granite.author.responsive.EditableActions.REFRESH.execute instead");
            return ns.responsive.EditableActions.REFRESH.execute(editable, config)
        },
        setWidth: function(editable, width) {
            var curBreakpoint = ns.responsive.getCurrentBreakpoint();
            this.setBreakpointConfig(editable, curBreakpoint, {
                width: width
            })
        },
        resetBreakpointConfig: function(editable, breakpoint) {
            var pr = new ns.persistence.PostRequest
              , bp = breakpoint || ns.responsive.getCurrentBreakpoint()
              , toReset = [];
            if (bp) {
                var children = ns.editables.getChildren(editable);
                children.forEach(function(child) {
                    if (child.config.responsive && child.config.responsive[bp])
                        toReset.push(child.path + "/" + ns.responsive.NN_RESPONSIVE + "/" + bp)
                })
            }
            if (toReset.length)
                return pr.setURL(editable.path).setParam(":operation", "delete").setParam(":applyTo", toReset).send();
            return $.Deferred().resolve().promise()
        },
        showHiddenChildren: function(editable, breakpoint) {
            var pr = new ns.persistence.PostRequest
              , bp = breakpoint || ns.responsive.getCurrentBreakpoint()
              , doPost = false;
            if (bp) {
                var children = ns.responsive.getHiddenChildren(editable, bp);
                children.forEach(function(child) {
                    var breakpointPath = child.path.substring(editable.path.length + 1) + "/" + ns.responsive.NN_RESPONSIVE + "/" + bp;
                    var path = breakpointPath + "/behavior";
                    if (child.config.responsive && !child.config.responsive[bp])
                        pr.setParam(breakpointPath + "/jcr:primaryType", "nt:unstructured");
                    if (child.config.responsive) {
                        doPost = true;
                        pr.setParam(path, "none")
                    }
                })
            }
            if (doPost)
                return pr.setURL(editable.path).send().then(function() {
                    ns.edit.EditableActions.REFRESH.execute(editable)
                });
            return $.Deferred().resolve().promise()
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var actions = {
        actions: {
            "AMOUNT": {
                icon: "viewOff",
                text: Granite.I18n.get("Show hidden components"),
                handler: function(editable, param, target) {
                    ns.responsive.interaction.stopUnhideMode()
                },
                render: function(dom, editable) {
                    var countElem = $("\x3cspan/\x3e", {
                        "text": ns.responsive.getHiddenChildren(editable).length,
                        "class": "cq-EditableToolbar-text cq-EditableToolbar-text--right"
                    });
                    dom.append(countElem);
                    dom.addClass("cq-EditableToolbar-button").css({
                        "background-color": "#326ec8",
                        "border-radius": "0"
                    });
                    return dom
                }
            },
            "UNHIDE": {
                text: Granite.I18n.get("Restore all"),
                handler: function(editable, param, target) {
                    ns.responsive.persistence.showHiddenChildren(editable).then(function() {
                        ns.responsive.interaction.stopUnhideMode()
                    })
                }
            }
        }
    };
    ns.responsive.unhide = {
        currentEditable: null,
        currentToolbar: null,
        open: function(editable) {
            var self = this;
            this.currentEditable = editable;
            var hiddenComponent = ns.responsive.getHiddenChildren(this.currentEditable);
            ns.ContentFrame.executeCommand(this.currentEditable.path, "toggleClass", {
                className: "aem-GridShowHidden",
                condition: true
            });
            ns.EditorFrame.editableToolbar.destroy();
            this.currentToolbar = new ns.responsive.unhide.Toolbar(actions);
            hiddenComponent.forEach(function(child) {
                child.overlay.dom.addClass("editor-ResponsiveGrid-overlayHiddenComponent");
                var button = $('\x3cbutton is\x3d"coral-button" variant\x3d"minimal" icon\x3d"viewedMarkAs" iconsize\x3d"S" data-path\x3d"' + child.path + '"/\x3e');
                button.addClass("editor-ResponsiveGrid-unHideButton").appendTo(child.overlay.dom).on("click", self.onShowComponent)
            });
            ns.overlayManager.reposition();
            setTimeout(function() {
                self.currentToolbar.render(self.currentEditable).position(self.currentEditable);
                self.currentEditable.overlay.setSelected(true)
            }, 50);
            channel.on("cq-overlay-outside-click.cq-responsive-layer-unhide", this.onOutsideOverlayClick.bind(this)).on("cq-overlay-click.cq-responsive-layer-unhide", this.onOutsideOverlayClick.bind(this))
        },
        close: function() {
            channel.off("cq-overlay-outside-click.cq-responsive-layer-unhide").off("cq-overlay-click.cq-responsive-layer-unhide");
            if (this.currentEditable) {
                ns.ContentFrame.executeCommand(this.currentEditable.path, "toggleClass", {
                    className: "aem-GridShowHidden",
                    condition: false
                });
                ns.edit.EditableActions.REFRESH.execute(this.currentEditable)
            }
            if (this.currentToolbar) {
                this.currentToolbar.close();
                this.currentToolbar.destroy();
                ns.EditorFrame.editableToolbar = new ns.responsive.Toolbar(ns.responsive.CONFIG)
            }
            this.currentToolbar = null;
            this.currentEditable = null
        },
        onShowComponent: function(event) {
            var path = $(event.currentTarget).data("path")
              , editable = ns.editables.find(path)[0];
            if (editable)
                ns.responsive.persistence.setBreakpointConfig(editable, ns.responsive.getCurrentBreakpoint(), {
                    behavior: "none"
                }).then(function() {
                    ns.responsive.interaction.stopUnhideMode()
                })
        },
        onOutsideOverlayClick: function(event) {
            var elem = event.originalEvent.currentTarget;
            while (elem.parentNode && elem.parentNode !== document) {
                if (elem === this.currentEditable.overlay.dom[0])
                    return;
                elem = elem.parentNode
            }
            ns.responsive.interaction.stopUnhideMode()
        }
    };
    ns.responsive.unhide.Toolbar = function() {
        ns.responsive.unhide.Toolbar.super_.constructor.apply(this, arguments)
    }
    ;
    ns.util.inherits(ns.responsive.unhide.Toolbar, ns.ui.Toolbar);
    ns.responsive.unhide.Toolbar.prototype.init = function() {
        return ns.responsive.Toolbar.super_.init.call(this, actions)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var selectedGrid = null;
    var resizeProperties = {};
    function getSpacing(selectedGridColumns, spacing, columns) {
        return Math.max(parseInt(selectedGridColumns) - spacing - columns, 0)
    }
    function getCurrentLineOccupiedColumns(editable, gridColumns, currentBreakpoint) {
        var parent = ns.editables.getParent(editable);
        if (!parent)
            return 0;
        var getInt = function(config, prop) {
            return !!config[prop] ? parseInt(config[prop]) : 0
        };
        var size = function(config) {
            return getInt(config, "width") + getInt(config, "offset")
        };
        var siblingEditables = ns.editables.getChildren(parent);
        var editableIndex = siblingEditables.findIndex(function(sibling) {
            return editable.path === sibling.path
        });
        return siblingEditables.slice(0, editableIndex).reduce(function(prevSize, current) {
            var config = current.config && current.config.responsive && current.config.responsive[currentBreakpoint];
            if (!config)
                config = current.config && current.config.responsive && current.config.responsive.default;
            if (config && "hide" === config.behavior)
                return prevSize;
            if (!config || !parseInt(config.width))
                return gridColumns;
            var editableSize = size(config);
            if ("newline" === config.behavior || prevSize + editableSize > gridColumns)
                return editableSize;
            else
                return prevSize + editableSize
        }, 0)
    }
    function getResidualColumns(gridColumns, occupiedColumns, framedColumns) {
        return Math.max(gridColumns - occupiedColumns - framedColumns, 0)
    }
    function fitInLine(occupiedColumns, framedColumns, gridColumns, columns) {
        return occupiedColumns + framedColumns <= gridColumns || gridColumns - occupiedColumns >= columns
    }
    function applyResponsiveConfigFromSiblings(selectedEditable, resizeProperties, columns) {
        if (!selectedEditable)
            return null;
        var parent = ns.editables.getParent(selectedEditable);
        var leftSpacing = getSpacing(resizeProperties.selectedGridColumns, resizeProperties.spacing, columns);
        if (!parent)
            return leftSpacing;
        var gridColumns = parseInt(resizeProperties.selectedGridColumns);
        var currentBreakpoint = ns.responsive.getCurrentBreakpoint();
        var occupiedColumns = getCurrentLineOccupiedColumns(selectedEditable, gridColumns, currentBreakpoint);
        var framedColumns = gridColumns - leftSpacing;
        if (fitInLine(occupiedColumns, framedColumns, gridColumns, columns))
            return getResidualColumns(gridColumns, occupiedColumns, framedColumns);
        return leftSpacing
    }
    function handleResizeLeft(selectedEditable, resizeProperties, column) {
        var behavior;
        var breakpoint = ns.responsive.getCurrentBreakpoint();
        if (selectedEditable.config.responsive && selectedEditable.config.responsive[breakpoint])
            behavior = selectedEditable.config.responsive[breakpoint].behavior;
        if ("newline" === behavior)
            return getSpacing(resizeProperties.selectedGridColumns, resizeProperties.spacing, column);
        return applyResponsiveConfigFromSiblings(selectedEditable, resizeProperties, column)
    }
    ns.responsive.interaction = {
        isResizing: false,
        isBlocked: false,
        setSelected: function(editable) {
            var selectedEditable = ns.selection.getAllSelected()[0];
            if (selectedEditable)
                ns.selection.deselect(selectedEditable);
            ns.selection.select(editable);
            this.setSelectedGrid(editable)
        },
        setSelectedGrid: function(editable) {
            selectedGrid = editable ? ns.editables.getParent(editable) : null
        },
        removeSelection: function() {
            ns.selection.deselectAll();
            selectedGrid = null
        },
        addGridLines: function(gridEditable) {
            var rect = gridEditable.overlay.dom[0].getBoundingClientRect()
              , overlayWrapperRect = ns.OverlayWrapper.$el[0].getBoundingClientRect()
              , left = rect.left - overlayWrapperRect.left
              , col = ns.responsive.getGridWidth(gridEditable)
              , cellWidth = rect.width / col
              , con = $(".js-editor-ResponsiveGrid-resizeGrid");
            con.empty();
            for (var i = 0; i < col; i++)
                $("\x3cdiv/\x3e", {
                    "class": "editor-ResponsiveGrid-resizeGrid-column"
                }).css({
                    "left": left + i * cellWidth,
                    "width": cellWidth
                }).appendTo(con)
        },
        removeGridLines: function() {
            $(".js-editor-ResponsiveGrid-resizeGrid").empty()
        },
        getSnapLine: function(x, y) {
            if (!resizeProperties.gridCellWidth)
                return {
                    x: x,
                    y: y
                };
            var currentCol = Math.round((x - resizeProperties.gridRect.left) / resizeProperties.gridCellWidth);
            return {
                x: resizeProperties.gridRect.left + currentCol * resizeProperties.gridCellWidth,
                y: y,
                range: resizeProperties.gridCellWidth / 4
            }
        },
        onResizeStart: function(event) {
            var target = event.target;
            this.isResizing = true;
            resizeProperties.selectedGridColumns = ns.responsive.getGridWidth(selectedGrid);
            var gridRect = selectedGrid.overlay.dom[0].getBoundingClientRect();
            var componentRec = target.getBoundingClientRect();
            resizeProperties.componentRect = {};
            resizeProperties.componentRect.left = componentRec.left - gridRect.left;
            resizeProperties.componentRect.top = componentRec.top - gridRect.top;
            resizeProperties.componentRect.width = componentRec.width;
            resizeProperties.componentRect.height = componentRec.height;
            resizeProperties.gridRect = gridRect;
            resizeProperties.handle = $(event.originalTarget).attr("data-edge");
            resizeProperties.gridCellWidth = gridRect.width / resizeProperties.selectedGridColumns;
            resizeProperties.initialCells = Math.round(resizeProperties.componentRect.width / resizeProperties.gridCellWidth);
            resizeProperties.spacing = Math.round(getSpacing(gridRect.width, 0, componentRec.right - gridRect.left) / resizeProperties.gridCellWidth);
            if (resizeProperties.handle === "left") {
                resizeProperties.restrict = {
                    left: [0, resizeProperties.componentRect.left + resizeProperties.componentRect.width - resizeProperties.gridCellWidth],
                    width: [resizeProperties.gridCellWidth, gridRect.width]
                };
                resizeProperties.startX = componentRec.left
            } else if (resizeProperties.handle === "right") {
                resizeProperties.restrict = {
                    left: [0, gridRect.width],
                    width: [resizeProperties.gridCellWidth, gridRect.width]
                };
                resizeProperties.startX = componentRec.left + componentRec.width
            }
            this.addGridLines(selectedGrid)
        },
        onResizeMove: function(event) {
            var snapline = this.getSnapLine(event.clientX, event.clientY), target = event.target, deltaX, targetLeft, targetWidth;
            if (event.clientX > snapline.x - snapline.range && event.clientX < snapline.x + snapline.range)
                deltaX = snapline.x - resizeProperties.startX;
            else
                deltaX = event.clientX - resizeProperties.startX;
            if (resizeProperties.handle === "left") {
                targetLeft = resizeProperties.componentRect.left + deltaX;
                if (targetLeft >= resizeProperties.restrict.left[0])
                    targetWidth = resizeProperties.componentRect.width - deltaX;
                else
                    targetWidth = resizeProperties.componentRect.left + resizeProperties.componentRect.width
            } else {
                targetLeft = resizeProperties.componentRect.left;
                targetWidth = resizeProperties.componentRect.width + deltaX
            }
            if (targetLeft < resizeProperties.restrict.left[0])
                targetLeft = resizeProperties.restrict.left[0];
            if (targetLeft > resizeProperties.restrict.left[1])
                targetLeft = resizeProperties.restrict.left[1];
            if (targetWidth < resizeProperties.restrict.width[0])
                targetWidth = resizeProperties.restrict.width[0];
            if (targetWidth > resizeProperties.restrict.width[1])
                targetWidth = resizeProperties.restrict.width[1];
            target.style.left = targetLeft + "px";
            target.style.width = targetWidth + "px"
        },
        onOverlayHover: function(event) {
            if (this.isResizing || this.isBlocked)
                return;
            event.stopImmediatePropagation();
            event.editable.overlay.setHover(event.originalEvent.type === "mouseover")
        },
        onOverlayClick: function(event) {
            if (this.isBlocked)
                return;
            var e = event.editable
              , parent = ns.editables.getParent(e);
            if (e.type === "wcm/foundation/components/responsivegrid/new")
                if (parent)
                    e = parent;
            if (ns.responsive.isResponsiveGrid(e) || ns.responsive.isResponsiveGrid(parent)) {
                ns.responsive.interaction.setSelected(e);
                ns.EditorFrame.editableToolbar.open(e)
            } else
                this.onOutsideOverlayClick()
        },
        onOutsideOverlayClick: function() {
            if (this.isBlocked)
                return;
            ns.responsive.interaction.removeSelection();
            ns.EditorFrame.editableToolbar.close()
        },
        onResizeEnd: function(event) {
            var self = this;
            var selectedEditable = ns.selection.getAllSelected()[0];
            if (selectedEditable) {
                var editableWidth = parseInt(selectedEditable.overlay.dom.width());
                var resizeConfig = {};
                resizeConfig.width = Math.round(editableWidth / resizeProperties.gridCellWidth);
                if (resizeProperties.handle === "right" && selectedGrid.overlay.dom[0]) {
                    var gridRect = selectedGrid.overlay.dom[0].getBoundingClientRect();
                    var target = event.target;
                    var componentRec = target.getBoundingClientRect();
                    resizeProperties.spacing = Math.round(getSpacing(gridRect.width, 0, componentRec.right - gridRect.left) / resizeProperties.gridCellWidth)
                }
                resizeConfig.offset = handleResizeLeft(selectedEditable, resizeProperties, resizeConfig.width);
                ns.EditorFrame.editableToolbar.close();
                ns.responsive.persistence.setBreakpointConfig(selectedEditable, ns.responsive.getCurrentBreakpoint(), resizeConfig).then(function() {
                    return ns.responsive.EditableActions.REFRESH.execute(selectedEditable)
                }).then(function(newEditable) {
                    self.removeSelection();
                    self.removeGridLines();
                    ns.selection.select(newEditable);
                    selectedGrid = ns.editables.getParent(newEditable);
                    ns.EditorFrame.editableToolbar.open(newEditable)
                });
                resizeProperties = {};
                this.isResizing = false
            }
        },
        startUnhideMode: function(editable) {
            this.isBlocked = true;
            ns.responsive.unhide.open(editable)
        },
        stopUnhideMode: function() {
            this.isBlocked = false;
            ns.responsive.unhide.close()
        },
        _private: {
            getCurrentLineOccupiedColumns: getCurrentLineOccupiedColumns
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function selectEditable(editable) {
        ns.EditorFrame.editableToolbar.close();
        ns.responsive.interaction.removeSelection();
        ns.responsive.interaction.removeGridLines();
        ns.selection.select(editable);
        ns.responsive.interaction.setSelectedGrid(ns.editables.getParent(editable));
        ns.EditorFrame.editableToolbar.open(editable)
    }
    var actions = {
        "UNHIDE": new ns.ui.ToolbarAction({
            icon: "viewOff",
            text: Granite.I18n.get("Show hidden components"),
            execute: function(editable, param, target) {
                ns.responsive.interaction.startUnhideMode(editable)
            },
            condition: function(editable) {
                if (ns.responsive.isResponsiveGrid(editable)) {
                    if (!ns.responsive.getHiddenChildren(editable).length)
                        return false;
                    return true
                }
                return false
            },
            render: function(dom, editable) {
                var countElem = $("\x3cspan/\x3e", {
                    "text": ns.responsive.getHiddenChildren(editable).length,
                    "class": "cq-EditableToolbar-text cq-EditableToolbar-text--right"
                });
                dom.append(countElem);
                return dom
            }
        }),
        "RESET": new ns.ui.ToolbarAction({
            icon: "revert",
            text: Granite.I18n.get("Revert breakpoint layout"),
            execute: function(editable, param, target) {
                ns.responsive.persistence.resetBreakpointConfig(editable).then(function() {
                    ns.responsive.EditableActions.REFRESH.execute(editable).then(selectEditable)
                })
            },
            condition: function(editable) {
                if (ns.responsive.isResponsiveGrid(editable))
                    return true;
                return false
            }
        }),
        "NEWLINE": new ns.ui.ToolbarAction({
            icon: "layersBackward",
            text: Granite.I18n.get("Float to new line"),
            execute: function(editable, param, target) {
                var behavior = ns.responsive.getCurrentResponsiveConfig(editable).behavior || ns.responsive.getResponsiveConfig(editable, "default").behavior;
                var newBehavior = behavior !== "newline" ? "newline" : "none";
                ns.responsive.persistence.setBreakpointConfig(editable, ns.responsive.getCurrentBreakpoint(), {
                    behavior: newBehavior
                }).then(function() {
                    ns.responsive.EditableActions.REFRESH.execute(editable).then(selectEditable)
                })
            },
            condition: ns.responsive.isInResponsiveGrid.bind(ns.responsive),
            render: function(dom, editable) {
                var behavior = ns.responsive.getCurrentResponsiveConfig(editable).behavior || ns.responsive.getResponsiveConfig(editable, "default").behavior;
                if (behavior === "newline")
                    dom.addClass("is-active");
                return dom
            }
        }),
        "HIDE": new ns.ui.ToolbarAction({
            icon: "viewOff",
            text: Granite.I18n.get("Hide component"),
            execute: function(editable, param, target) {
                ns.responsive.persistence.setBreakpointConfig(editable, ns.responsive.getCurrentBreakpoint(), {
                    behavior: "hide"
                }).then(function() {
                    ns.responsive.EditableActions.REFRESH.execute(editable)
                })
            },
            condition: ns.responsive.isInResponsiveGrid.bind(ns.responsive)
        }),
        "CLOSE": new ns.ui.ToolbarAction({
            icon: "close",
            text: Granite.I18n.get("Close"),
            index: 101,
            execute: function(editable, param, target) {
                channel.trigger($.Event("cq-interaction-focus.toolbar-reset", {
                    editable: editable
                }))
            },
            condition: function(editable) {
                return ns.responsive.CONFIG.name !== ns.layerManager.getCurrentLayerName()
            },
            render: function(dom) {
                return dom.addClass("cq-EditableToolbar-button--modeSwitcher")
            }
        })
    };
    ns.responsive.Toolbar = function() {
        ns.responsive.Toolbar.super_.constructor.apply(this, arguments);
        var actionsList = {};
        ["PARENT"].forEach(function(e) {
            actionsList[e] = $.extend(true, {}, ns.edit.ToolbarActions[e])
        });
        for (var ac in actions)
            actionsList[ac] = actions[ac];
        return ns.responsive.Toolbar.super_.init.call(this, {
            actions: actionsList
        })
    }
    ;
    ns.util.inherits(ns.responsive.Toolbar, ns.ui.Toolbar);
    ns.responsive.Toolbar.prototype.destroy = function() {
        ns.responsive.Toolbar.super_.destroy.apply(this, arguments)
    }
    ;
    ns.responsive.Toolbar.prototype.appendButton = function(editable, name, action) {
        ns.responsive.Toolbar.super_.appendButton.apply(this, arguments)
    }
    ;
    ns.responsive.Toolbar.prototype.render = function(editable) {
        return ns.responsive.Toolbar.super_.render.apply(this, arguments)
    }
    ;
    ns.responsive.Toolbar.prototype.handleEvent = function(event) {
        ns.responsive.Toolbar.super_.handleEvent.apply(this, arguments)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var overlayClass = "cq-Overlay"
      , dropTargetClass = "cq-droptarget"
      , subDropTargetClass = "cq-subdroptarget cq-Overlay-subdroptarget";
    ns.responsive.Overlay = function(editable, container) {
        ns.responsive.Overlay.super_.constructor.call(this, editable, container)
    }
    ;
    ns.util.inherits(ns.responsive.Overlay, ns.ui.Overlay);
    ns.responsive.Overlay.prototype.render = function(editable, container) {
        var dom = ns.responsive.Overlay.super_.render.apply(this, arguments);
        var parent = ns.editables.getParent(editable);
        if (parent && ns.responsive.isResponsiveGrid(parent)) {
            if (editable.type !== "wcm/foundation/components/responsivegrid/new")
                var handleLeft = $("\x3cdiv/\x3e", {
                    "class": "editor-ResponsiveGrid-overlay-resizeHandle editor-ResponsiveGrid-overlay-resizeHandle--left",
                    "data-edge": "left"
                })
                  , handleRight = $("\x3cdiv/\x3e", {
                    "class": "editor-ResponsiveGrid-overlay-resizeHandle editor-ResponsiveGrid-overlay-resizeHandle--right",
                    "data-edge": "right"
                });
            dom.append(handleLeft).append(handleRight);
            dom.addClass("is-resizable")
        } else if (!ns.responsive.isResponsiveGrid(editable))
            dom.addClass("is-disabled");
        return dom
    }
    ;
    ns.responsive.Overlay.prototype.position = function(editable, parent) {
        ns.responsive.Overlay.super_.position.apply(this, arguments)
    }
    ;
    ns.responsive.Overlay.prototype.remove = function() {
        ns.responsive.Overlay.super_.remove.apply(this, arguments)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.responsive.CONFIG = {
        name: "Layouting",
        icon: "deviceTablet",
        title: Granite.I18n.get("Layout", "title of authoring layer"),
        overlayConstructor: ns.responsive.Overlay,
        toolbarConstructor: ns.responsive.Toolbar,
        interactions: {
            onOverlayHover: ns.responsive.interaction.onOverlayHover.bind(ns.responsive.interaction),
            onOverlayClick: ns.responsive.interaction.onOverlayClick.bind(ns.responsive.interaction),
            onOutsideOverlayClick: ns.responsive.interaction.onOutsideOverlayClick.bind(ns.responsive.interaction)
        },
        sidePanel: {
            setUp: function() {
                ns.ui.SidePanel.close(true);
                ns.ui.SidePanel.showEmptyContent()
            }
        }
    };
    ns.responsive.Layer = ns.util.extendClass(ns.Layer, {
        config: ns.responsive.CONFIG,
        isAvailable: function() {
            return ns.pageInfo && ns.pageInfo.responsive && ns.pageInfo.responsive.breakpoints
        },
        setUp: function() {
            ns.ui.dropController.disable();
            this._interactHandler = new ns.ui.Interaction({
                dragOrigin: ".cq-Overlay--component",
                allowFrom: ".editor-ResponsiveGrid-overlay-resizeHandle",
                start: ns.responsive.interaction.onResizeStart.bind(ns.responsive.interaction),
                move: ns.responsive.interaction.onResizeMove.bind(ns.responsive.interaction),
                end: ns.responsive.interaction.onResizeEnd.bind(ns.responsive.interaction)
            });
            $(document).find("#OverlayWrapper").append($("\x3cdiv/\x3e", {
                "class": "js-editor-ResponsiveGrid-resizeGrid editor-ResponsiveGrid-resizeGrid"
            }));
            ns.ui.emulator.toggle(true)
        },
        tearDown: function() {
            ns.ui.dropController.enable();
            $(".js-editor-ResponsiveGrid-resizeGrid").remove();
            this._interactHandler.destroy()
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.responsive.EditableActions = {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function mergeResponsiveDOM(columnEditable, columnDomStr) {
        if (!columnEditable || !columnDomStr)
            return;
        var columnDom;
        if (columnDomStr)
            columnDom = ns.util.htmlToNode(columnDomStr);
        if (!columnDom)
            return;
        var columnComponent = ns.components.find({
            resourceType: columnEditable.type
        });
        var initialColumnConfig = columnDom.querySelector('cq[data-path\x3d"' + columnEditable.path + '"]');
        columnEditable.updateConfig(ns.configParser(initialColumnConfig.dataset.config));
        return ns.editableHelper.updateDom(columnComponent[0], columnDom, columnEditable)
    }
    function updateResponsiveDOM(columnEditable, newDomStr) {
        var columnDomStr = mergeResponsiveDOM(columnEditable, newDomStr);
        if (!columnDomStr)
            return $.Deferred().reject().promise();
        return ns.ContentFrame.executeCommand(columnEditable.path, "replace", columnDomStr).then(function() {
            var newDom = ns.ContentFrame.getEditableNode(columnEditable.path);
            var newEditables = ns.ContentFrame.getEditables(newDom);
            var newChildren = newEditables.filter(function(newEditable) {
                return newEditable.path !== columnEditable.path
            });
            columnEditable.dom = newDom;
            columnEditable.updateConfig(ns.configParser(ns.ContentFrame.getEditableConfigNode(columnEditable.path).data("config")));
            ns.editables.remove(ns.editables.getChildren(columnEditable));
            ns.editables.add(newChildren, {
                editableNeighbor: columnEditable
            });
            ns.overlayManager.recreate(columnEditable);
            return columnEditable
        })
    }
    function processRefresh(editableAction, editable, config) {
        return ns.persistence.readParagraph(editable, config).then(editableAction._postExecute(editable))
    }
    ns.responsive.EditableActions.REFRESH = new ns.ui.EditableAction({
        execute: function doRefresh(editable, config) {
            var self = this;
            return ns.loadPageInfo().then(function() {
                return ns.editableHelper.overlayCompleteRefresh(processRefresh(self, editable, config))
            })
        },
        _postExecuteJSON: function(editable) {
            var targetEditable = ns.editables.getParent(editable);
            if (!targetEditable)
                targetEditable = editable;
            return ns.persistence.readParagraph(targetEditable, {}).then(function(data) {
                data = {
                    key: targetEditable.getNodeName(),
                    value: data
                };
                return ns.ContentFrame.executeCommand(targetEditable.path, "replace", data).then(function() {
                    return ns.ContentFrame.reloadEditable(editable)
                })
            })
        },
        _postExecuteHTML: function(editable, path, data) {
            return updateResponsiveDOM(editable, data).then(function(newEditable) {
                return newEditable
            })
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var _interactHandler;
    ns.edit.LayoutToolbar = ns.util.extendClass(ns.responsive.Toolbar, {
        constructor: function(config) {
            ns.edit.LayoutToolbar.super_.constructor.apply(this, arguments)
        },
        destroy: function() {
            ns.edit.LayoutToolbar.super_.destroy.apply(this, arguments)
        },
        appendButton: function(editable, name, action) {
            ns.edit.LayoutToolbar.super_.appendButton.apply(this, arguments)
        },
        render: function(editable) {
            return ns.edit.LayoutToolbar.super_.render.apply(this, arguments)
        },
        handleEvent: function(event) {
            ns.edit.LayoutToolbar.super_.handleEvent.apply(this, arguments)
        },
        open: function(editable) {
            ns.edit.LayoutToolbar.super_.open.apply(this, arguments);
            if (editable && editable.overlay && editable.overlay.dom && editable.overlay.dom.find(".editor-ResponsiveGrid-overlay-resizeHandle").length) {
                ns.ui.emulator.toggle(true);
                editable.overlay.dom.addClass("is-resizable");
                $(document).find("#OverlayWrapper").append($("\x3cdiv/\x3e", {
                    "class": "js-editor-ResponsiveGrid-resizeGrid editor-ResponsiveGrid-resizeGrid"
                }));
                ns.ui.dropController.disable();
                _interactHandler && _interactHandler.destroy();
                _interactHandler = new ns.ui.Interaction({
                    dragOrigin: ".cq-Overlay--component.is-resizable",
                    allowFrom: ".editor-ResponsiveGrid-overlay-resizeHandle",
                    start: ns.responsive.interaction.onResizeStart.bind(ns.responsive.interaction),
                    move: ns.responsive.interaction.onResizeMove.bind(ns.responsive.interaction),
                    end: ns.responsive.interaction.onResizeEnd.bind(ns.responsive.interaction)
                });
                ns.responsive.interaction.setSelectedGrid(editable)
            }
        },
        close: function() {
            if (this._currentEditable && this._currentEditable.overlay && this._currentEditable.overlay.dom && (this._currentEditable.overlay.dom.find(".editor-ResponsiveGrid-overlay-resizeHandle").length || this._currentEditable.hasPlaceholder())) {
                $(".js-editor-ResponsiveGrid-resizeGrid").remove();
                ns.ui.dropController.enable();
                _interactHandler && _interactHandler.destroy();
                ns.responsive.interaction.setSelectedGrid(null);
                ns.ui.emulator.toggle(false);
                ns.edit.LayoutToolbar.super_.close.apply(this, arguments)
            }
            ns.editables.forEach(function(editable) {
                editable.overlay && editable.overlay.dom.removeClass("is-resizable")
            })
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.components = function() {
        var self = [];
        var cache = {};
        self.allowedComponents = [];
        self.allowedComponentsFor = {};
        self.clean = function() {
            self.length = 0;
            channel.trigger("cq-components-store-cleaned")
        }
        ;
        self.add = function(components) {
            $.each($.isArray(components) ? components : [components], function(i, e) {
                self.push(e)
            })
        }
        ;
        self.remove = function(components) {
            var affected = $.isArray(components) ? components : [components]
              , toRemove = [];
            $.each(affected, function(i, e) {
                if (e instanceof Granite.Component)
                    toRemove.push(e);
                else
                    self.find(e).forEach(function(e) {
                        toRemove.push(e)
                    })
            });
            $.each(self, function(i, e) {
                if ($.inArray(e, toRemove))
                    self.splice(i, 1)
            })
        }
        ;
        self.set = function(components) {
            self.clean();
            self.add(components);
            channel.trigger($.Event("cq-components-store-set", {
                components: components
            }))
        }
        ;
        self.find = function(search) {
            var result = [];
            if ($.type(search) === "string")
                search = {
                    path: search
                };
            if (search.path) {
                var key = "" + search.path;
                if (search.findFirst === true && cache[key])
                    return cache[key];
                else
                    $.each(self, function(i, component) {
                        if (search.path instanceof RegExp ? search.path.test(component.getPath()) : component.getPath() === search.path) {
                            if (!cache[key])
                                cache[key] = component;
                            result.push(component);
                            if (search.findFirst === true)
                                return false
                        }
                    })
            } else if (search.resourceType)
                $.each(self, function(i, component) {
                    if (search.resourceType instanceof RegExp ? search.resourceType.test(component.getResourceType()) : component.getResourceType() === search.resourceType)
                        result.push(component)
                });
            else if (search.group)
                $.each(self, function(i, component) {
                    if (search.group instanceof RegExp ? search.group.test(component.getGroup()) : component.getGroup() === search.group)
                        result.push(component)
                });
            if (search.findFirst === true)
                return result[0];
            return result
        }
        ;
        self.getGroups = function(components) {
            var comps = components || self.allowedComponents, groups = [], g;
            comps.forEach(function(component) {
                g = component.getGroup();
                if (groups.indexOf(g) === -1)
                    groups.push(g)
            });
            return groups
        }
        ;
        self.filterAllowedComponents = function(filter, append) {
            var allowedComponents = []
              , doUpdate = false;
            if (Array.isArray(filter)) {
                var filterArray = filter;
                filter = {};
                filterArray.forEach(function(element) {
                    filter[element] = true
                })
            }
            for (var key in filter) {
                var searchOptions = {};
                var index = key.indexOf("/");
                if (index !== -1)
                    if (index === 0)
                        searchOptions.path = key;
                    else
                        searchOptions.resourceType = key;
                else
                    searchOptions.group = key.substring(key.indexOf(":") + 1);
                $.each(self.find(searchOptions), function(i, c) {
                    if (allowedComponents.indexOf(c) < 0)
                        allowedComponents.push(c)
                })
            }
            if (append && $.isArray(self.allowedComponents))
                allowedComponents.forEach(function(allowedComponent) {
                    if (self.allowedComponents.indexOf(allowedComponent) === -1) {
                        self.allowedComponents.push(allowedComponent);
                        doUpdate = true
                    }
                });
            else {
                self.allowedComponents = allowedComponents;
                doUpdate = true
            }
            if (doUpdate === true)
                channel.trigger($.Event("cq-components-filtered", {
                    allowedComponents: allowedComponents,
                    append: append
                }))
        }
        ;
        self._findAllowedComponentsFromPolicy = function(editable, design) {
            var cell = ns.util.resolveProperty(design, editable.config.policyPath);
            if (!cell || !cell.components) {
                var parent = ns.editables.getParent(editable);
                var isSPAComponent = editable.dom[0] && editable.dom[0].dataset["cqDataPath"];
                if (!parent && isSPAComponent) {
                    var parentContext = ns.editContext.getEditContext(editable.getParentPath());
                    cell = parentContext && ns.util.resolveProperty(design, parentContext.policyPath)
                } else
                    while (parent && !(cell && cell.components)) {
                        cell = ns.util.resolveProperty(design, parent.config.policyPath);
                        parent = ns.editables.getParent(parent)
                    }
            }
            if (cell && cell.components)
                return [].concat(cell.components);
            return []
        }
        ;
        self._findAllowedComponentsFromDesign = function(editable, design) {
            var allowed = [];
            if (editable && editable.config)
                if (editable.config.policyPath)
                    allowed = self._findAllowedComponentsFromPolicy(editable, design);
                else
                    allowed = [].concat(ns.designResolver.getProperty(editable.config, design, "components") || []);
            return allowed
        }
        ;
        self._updateAllowedComponentsFromListener = function(editable, allowedComponents) {
            if (editable.updateComponentList)
                editable.updateComponentList(allowedComponents, self);
            return allowedComponents
        }
        ;
        self.computeAllowedComponents = function(editable, design) {
            if (!editable || !editable.config || !editable.config.isContainer)
                return;
            var allowedFromDesign = self._findAllowedComponentsFromDesign(editable, design);
            var allowed = self._updateAllowedComponentsFromListener(editable, allowedFromDesign);
            var parent = ns.editables.getParent(editable);
            if (allowed && allowed.length === 0 && parent)
                return self.computeAllowedComponents(parent, design);
            self.allowedComponentsFor[editable.path] = allowed;
            editable.design.allowedComponents = allowed;
            return allowed
        }
        ;
        self.sortComponents = function(c1, c2) {
            if (c1.getTitle() === c2.getTitle()) {
                if (c1.getGroup() < c2.getGroup())
                    return -1;
                else if (c1.getGroup() > c2.getGroup())
                    return 1;
                return 0
            }
            return c1.getTitle() < c2.getTitle() ? -1 : 1
        }
        ;
        return self
    }();
    channel.on("cq-components-loaded", function(event) {
        ns.components.set(event.components)
    });
    channel.on("cq-editor-loaded", function() {
        ns.components.allowedComponents = [];
        ns.components.allowedComponentsFor = {};
        ns.editables.forEach(function(editable) {
            ns.components.filterAllowedComponents(ns.components.computeAllowedComponents(editable, ns.pageDesign), true)
        });
        channel.off("cq-editable-added.allowedcomponents").on("cq-editable-added.allowedcomponents", function(event) {
            ns.components.filterAllowedComponents(ns.components.computeAllowedComponents(event.editable, ns.pageDesign), true)
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.editables = function() {
        var self = [];
        var onReadyListeners = {};
        var onTypeReadyListeners = {};
        self.clean = function() {
            self.forEach(function(e) {
                e.destroy()
            });
            self.length = 0;
            channel.trigger($.Event("cq-editables-updated", {
                editables: self
            }))
        }
        ;
        self.add = function(editables, config) {
            editables = $.isArray(editables) ? editables : [editables];
            editables.forEach(function(editable) {
                var existing = self.find(editable.path);
                if (existing.length !== 0)
                    existing.forEach(function(e) {
                        self.remove(e);
                        e.destroy()
                    });
                editable.updateConfig();
                if (!config || !config.insertBehavior || !config.editableNeighbor)
                    self.push(editable);
                else {
                    var index = self.indexOf(config.editableNeighbor);
                    if (config.insertBehavior === "before")
                        self.splice(index, 0, editable);
                    else if (config.insertBehavior === "after") {
                        index += 1;
                        self.splice(index, 0, editable)
                    } else
                        self.push(editable)
                }
                channel.trigger($.Event("cq-inspectable-added", {
                    inspectable: editable
                }));
                channel.trigger($.Event("cq-editable-added", {
                    editable: editable
                }))
            });
            channel.trigger($.Event("cq-editables-updated", {
                editables: self
            }))
        }
        ;
        self.remove = function(editable, removeChildren) {
            var affected = $.isArray(editable) ? editable : [editable]
              , toRemove = [];
            $.each(affected, function(i, e) {
                if (e instanceof ns.Inspectable) {
                    toRemove.push(e);
                    if (removeChildren)
                        toRemove = toRemove.concat(self.getChildren(e, true))
                } else
                    self.find(e).forEach(function(e) {
                        toRemove.push(e);
                        if (removeChildren)
                            toRemove = toRemove.concat(self.getChildren(e, true))
                    })
            });
            for (var i = 0; i < self.length; )
                if ($.inArray(self[i], toRemove) > -1)
                    self.splice(i, 1);
                else
                    i++;
            channel.trigger($.Event("cq-editables-updated", {
                editables: self
            }))
        }
        ;
        self.move = function(editable, config) {
            if (!config || !config.insertBehavior || !config.editableNeighbor)
                return;
            else {
                var oldIndex = self.indexOf(editable);
                var newIndex = self.indexOf(config.editableNeighbor);
                if (oldIndex !== -1)
                    self.splice(oldIndex, 1);
                if (config.insertBehavior === "before")
                    self.splice(newIndex, 0, editable);
                else if (config.insertBehavior === "after") {
                    newIndex += 1;
                    self.splice(newIndex, 0, editable)
                } else
                    self.push(editable)
            }
            channel.trigger($.Event("cq-editables-updated", {
                editables: self
            }))
        }
        ;
        self.set = function(editables) {
            self.clean();
            self.add(editables)
        }
        ;
        self.find = function(search) {
            var result = [];
            if ($.type(search) === "string")
                search = {
                    path: search
                };
            if (search.path)
                $.each(self, function(i, e) {
                    if (search.path instanceof RegExp ? search.path.test(e.path) : e.path === search.path)
                        result.push(e)
                });
            else if (search.type)
                $.each(self, function(i, e) {
                    if (search.type instanceof RegExp ? search.type.test(e.type) : e.type === search.type)
                        result.push(e)
                });
            return result
        }
        ;
        self.getRoot = function() {
            var editable = self[0]
              , test = editable ? self.getParent(editable) : editable;
            while (test) {
                editable = test;
                test = self.getParent(editable)
            }
            return editable
        }
        ;
        self.isRootContainer = function(editable) {
            return editable && editable.config && editable.config.isContainer && !self.getParent(editable)
        }
        ;
        self.getParent = function(editable, all) {
            var parentPath = editable.getParentPath();
            var parent = self.find(parentPath)[0];
            while (!parent && parentPath !== "") {
                parentPath = ns.Inspectable.prototype.getParentPath.call({
                    path: parentPath
                });
                parent = self.find(parentPath)[0]
            }
            if (all) {
                var parents = [];
                while (parent) {
                    parents.push(parent);
                    parent = self.getParent(parent)
                }
                return parents
            } else
                return parent
        }
        ;
        self.getSelectableParents = function(editable) {
            var allParents = self.getParent(editable, true)
              , selectableParents = [];
            allParents.forEach(function(parent) {
                if (parent.hasActionsAvailable())
                    selectableParents.push(parent)
            });
            return selectableParents
        }
        ;
        self.getChildren = function(editable, all) {
            var path = editable.path.replace("*", "\\*")
              , scope = all ? "/.+" : "/[^/]+$";
            return self.find({
                path: new RegExp("^" + path + scope)
            })
        }
        ;
        self.onReady = function(path, listener) {
            onReadyListeners[path] = listener
        }
        ;
        self.onTypeReady = function(type, listener) {
            onTypeReadyListeners[type] = listener
        }
        ;
        channel.on("cq-editable-added", function(event) {
            var editable = event.editable
              , onReadyListener = onReadyListeners[editable.path]
              , onTypeReadyListener = onTypeReadyListeners[editable.type];
            if (onReadyListener)
                onReadyListener(editable);
            if (onTypeReadyListener)
                onTypeReadyListener(editable)
        });
        return self
    }();
    channel.on("cq-editables-loaded", function(event) {
        ns.editables.set(event.editables)
    });
    channel.on("cq-editables-update", function(event) {
        if (!event || !event.editables)
            return;
        var editables = event.editables;
        for (var i = 0, length = editables.length; i < length; i++) {
            var editable = editables[i];
            ns.editables.remove(ns.editables.getChildren(editable));
            if (event.children && event.children.length > i) {
                var children = event.children[i];
                if (children)
                    ns.editables.add(children, {
                        editableNeighbor: editable
                    })
            }
        }
    });
    Object.defineProperty(ns, "store", {
        get: function() {
            Granite.author.util.deprecated("Use Granite.author.editables instead");
            return ns.editables
        },
        set: function(value) {
            Granite.author.util.deprecated("Use Granite.author.editables instead");
            ns.editables = value
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.PageInfoHelper = ns.util.createClass({
        constructor: function PageInfoHelper(pageInfoJSON) {
            this.json = pageInfoJSON
        },
        isLocked: function() {
            return this.json.status && this.json.status.isLocked
        },
        isDeveloper: function() {
            return this.json.status && this.json.status.isDeveloper
        },
        isDesignable: function() {
            return this.json.status && this.json.status.isDesignable
        },
        hasEditableTemplate: function() {
            return this.json.editableTemplate
        },
        canModify: function() {
            return this.json.permissions && this.json.permissions.modify
        },
        getLockOwner: function() {
            if (this.json.status)
                return this.json.status.lockOwner;
            else
                return undefined
        }
    });
    ns.pageInfo = undefined;
    channel.on("cq-page-info-loaded", function(event) {
        ns.pageInfo = event.pageInfo;
        ns.pageInfoHelper = new ns.PageInfoHelper(event.pageInfo)
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.pageDesign = undefined;
    channel.on("cq-page-design-loaded", function(event) {
        ns.pageDesign = event.pageDesign
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var SECTION_CLASS = "section";
    ns.editableHelper = function() {
        var self = {};
        self.DEFAULTS = {
            actions: {
                INSERT: ns.edit.EditableActions.INSERT,
                REFRESH: ns.edit.EditableActions.REFRESH,
                UPDATE: ns.edit.EditableActions.UPDATE,
                COPY: ns.edit.EditableActions.COPY,
                MOVE: ns.edit.EditableActions.MOVE,
                DELETE: ns.edit.EditableActions.DELETE
            }
        };
        self.doBulkOperation = function doBulkOperation(operation, operationArguments, editables, callback) {
            var index = 0
              , length = editables.length
              , deferred = $.Deferred();
            (function continueOperation(index) {
                if (index < length) {
                    operationArguments.unshift(editables[index]);
                    operation.apply(null, operationArguments).always(function() {
                        if (callback)
                            callback(editables[index]);
                        index += 1;
                        operationArguments.shift();
                        continueOperation(index)
                    })
                } else
                    deferred.resolve()
            }
            )(index);
            return deferred.promise()
        }
        ;
        self.updateDom = function updateDom(component, dom, editable) {
            var divAttributes = component.componentConfig.divAttributes || {}, $dom = $(dom), $newDom, newDomString, gridClasses;
            $dom.toArray().some(function(html) {
                if (html.outerHTML) {
                    $newDom = $(html.outerHTML);
                    $.each(divAttributes, function(attr, val) {
                        if (attr === "class") {
                            var curCssClass = html.className.split(" ");
                            var newCssClass = val.split(" ");
                            val = "";
                            if (!$newDom[0].classList.contains(SECTION_CLASS))
                                val += SECTION_CLASS + " ";
                            val += html.className;
                            for (var i = 0; i < newCssClass.length; i++)
                                if (curCssClass.indexOf(newCssClass[i]) === -1)
                                    val += " " + newCssClass[i]
                        }
                        $newDom.attr(attr, val)
                    });
                    return true
                }
            });
            var newDomElement = $newDom[0];
            if (ns.responsive.isResponsive(editable))
                ns.responsive.updateDom(editable, newDomElement);
            newDomString = newDomElement.outerHTML;
            $dom = null;
            $newDom = null;
            return newDomString
        }
        ;
        self.getInsertFunction = function getInsertFunction(insertBehavior) {
            return insertBehavior === ns.persistence.PARAGRAPH_ORDER.before ? "insertBefore" : insertBehavior === ns.persistence.PARAGRAPH_ORDER.after ? "insertAfter" : "insertLast"
        }
        ;
        self.overlayCompleteRefresh = function overlayCompleteRefresh(promise) {
            return promise.done(function(editable) {
                return ns.overlayManager.reposition().then(function() {
                    return editable
                })
            })
        }
        ;
        self.setUp = function(actions) {
            $.extend(true, actions, self.DEFAULTS.actions);
            this.actions = actions
        }
        ;
        self.tearDown = function() {
            this.actions = {}
        }
        ;
        self.actions = self.DEFAULTS.actions;
        self.getEditableDisplayableName = function(editable) {
            var splittedPath = editable.type.split("/")
              , relativePath = splittedPath[splittedPath.length - 1]
              , component = ns.components.find({
                resourceType: editable.type
            })[0]
              , componentTitle = component ? component.getTitle() : ""
              , toUpperCaseFirstLetter = function(string) {
                return string.charAt(0).toUpperCase() + string.slice(1)
            };
            if (componentTitle && componentTitle.length > 0)
                return Granite.I18n.get(componentTitle);
            else
                return toUpperCaseFirstLetter(relativePath) + " container"
        }
        ;
        self.loadContent = function(editable, url) {
            return $.ajax({
                type: "GET",
                dataType: "html",
                url: url
            }).then(function(dom) {
                return self.setContent(editable, dom)
            })
        }
        ;
        self.loadConfig = function(editable) {
            return ns.persistence.readParagraph(editable).then(function(data) {
                var cfg, cfgNode, dom = $(data);
                cfgNode = dom.find('cq[data-path\x3d"' + editable.path + '"]');
                cfg = ns.configParser(cfgNode.data("config"));
                editable.updateConfig(cfg)
            })
        }
        ;
        self.setContent = function(editable, content) {
            function process(editable) {
                return ns.ContentFrame.executeCommand(editable.path, "replaceContent", content)
            }
            return self.overlayCompleteRefresh(process(editable))
        }
        ;
        self.getAllowedComponents = function(editable) {
            Granite.author.util.deprecated();
            if (editable)
                return ns.components.allowedComponentsFor[editable.path]
        }
        ;
        self.getStyleProperty = function(editable, name, inheritStyle) {
            if (!ns.pageDesign)
                return null;
            if (editable && editable.config) {
                var suffix = "";
                var idx = name.lastIndexOf("/");
                if (idx > 0) {
                    suffix = "/" + name.substring(0, idx);
                    name = name.substring(idx + 1)
                }
                var style;
                if (editable.config.policyPath) {
                    style = ns.editableHelper.getStyleEntry(editable.config.policyPath);
                    style = style && style[name] || null
                } else
                    style = ns.designResolver.getProperty(editable.config, ns.pageDesign, name);
                if (style)
                    return style;
                if (inheritStyle)
                    return self.getInheritedStyleEntry(editable, name, suffix)
            }
            return null
        }
        ;
        self.getStyleEntry = function(path) {
            var segs = path.split("/");
            var obj = ns.pageDesign;
            for (var i = 0; i < segs.length && obj; i++)
                obj = obj[segs[i]];
            return obj
        }
        ;
        self.getInheritedStyleEntry = function(editable, propertyName, suffix) {
            if (!editable)
                return null;
            var parent = ns.editables.getParent(editable);
            var obj = null;
            if (parent) {
                if (parent.config) {
                    var style;
                    if (parent.config.policyPath) {
                        style = ns.editableHelper.getStyleEntry(parent.config.policyPath);
                        style = style && style[propertyName] || null
                    } else
                        style = ns.designResolver.getProperty(parent.config, ns.pageDesign, propertyName);
                    if (style)
                        return style
                }
                obj = self.getInheritedStyleEntry(parent, propertyName, suffix)
            }
            return obj
        }
        ;
        self.doCopy = function(editable, insertBehavior, editableNeighbor, historyConfig) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.COPY.execute instead");
            return ns.edit.EditableActions.COPY.execute(editable, insertBehavior, editableNeighbor, historyConfig)
        }
        ;
        self.doDelete = function(editables, historyConfig) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.DELETE.execute instead");
            return ns.edit.EditableActions.DELETE.execute(editables, historyConfig)
        }
        ;
        self.doInsert = function(component, insertBehavior, editableNeighbor, historyConfig, additionalData) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.INSERT.execute instead");
            return ns.edit.EditableActions.INSERT.execute(component, insertBehavior, editableNeighbor, historyConfig, additionalData)
        }
        ;
        self.canInsert = function(editableBefore, componentPath, componentGroup) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.INSERT.condition instead");
            return ns.edit.EditableActions.INSERT.condition(editableBefore, componentPath, componentGroup)
        }
        ;
        self.doMove = function(editable, insertBehavior, editableNeighbor, historyConfig) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.MOVE.execute instead");
            return ns.edit.EditableActions.MOVE.execute(editable, insertBehavior, editableNeighbor, historyConfig)
        }
        ;
        self.doRefresh = function(editable) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.REFRESH.execute instead");
            return ns.edit.EditableActions.REFRESH.execute(editable)
        }
        ;
        self.doUpdate = function(editable, properties) {
            Granite.author.util.deprecated("Use Granite.author.edit.EditableActions.UPDATE.execute instead");
            return ns.edit.EditableActions.UPDATE.execute(editable, properties)
        }
        ;
        self.doConfigure = function(editable) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.CONFIGURE.execute instead");
            return ns.edit.ToolbarActions.CONFIGURE.execute(editable)
        }
        ;
        self.doInPlaceEdit = function(editable) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.EDIT.execute instead");
            return ns.edit.ToolbarActions.EDIT.execute(editable)
        }
        ;
        self.doDeleteConfirm = function() {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.DELETE.execute instead");
            return ns.edit.ToolbarActions.DELETE.execute()
        }
        ;
        self.doCopyToClipboard = function() {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.COPY.execute instead");
            return ns.edit.ToolbarActions.COPY.execute()
        }
        ;
        self.doCutToClipboard = function() {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.CUT.execute instead");
            return ns.edit.ToolbarActions.CUT.execute()
        }
        ;
        self.doPasteFromClipboard = function(editableBefore) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.PASTE.execute instead");
            return ns.edit.ToolbarActions.PASTE.execute(editableBefore)
        }
        ;
        self.doSelectParent = function(editable, target, selectableParents) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.PARENT.execute instead");
            return ns.edit.ToolbarActions.PARENT.execute(editable, selectableParents, target)
        }
        ;
        self.openInsertDialog = function(editable) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.INSERT.execute instead");
            return ns.edit.ToolbarActions.INSERT.execute(editable)
        }
        ;
        self.canInPlaceEdit = function(editable) {
            Granite.author.util.deprecated("Use Granite.author.edit.ToolbarActions.EDIT.condition instead");
            return ns.edit.ToolbarActions.EDIT.condition(editable)
        }
        ;
        self.cleanUp = function() {
            Granite.author.util.deprecated()
        }
        ;
        self.fireInlineEdit = function(editable) {
            Granite.author.util.deprecated();
            var event = {};
            event.type = "inline-edit-start";
            event.editable = editable;
            channel.trigger(event)
        }
        ;
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.TagList = function(taglistElem) {
        Granite.author.util.deprecated();
        this.tagList = taglistElem[0];
        this.elem = taglistElem;
        this.selectedTags = {}
    }
    ;
    ns.ui.TagList.prototype.getElement = function() {
        return this.elem
    }
    ;
    ns.ui.TagList.prototype.getSelectedTags = function() {
        return this.selectedTags
    }
    ;
    ns.ui.TagList.prototype.clearAll = function() {
        this.elem.trigger("itemremovedall");
        for (var key in this.selectedTags)
            for (var tag in this.selectedTags[key])
                this._removeTagFilter(tag, key)
    }
    ;
    ns.ui.TagList.prototype.getValues = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            Coral.commons.ready(self.tagList, function(tagList) {
                resolve(tagList.values)
            })
        }
        )
    }
    ;
    ns.ui.TagList.prototype._setTagFilter = function(filterDisplay, filterValue, filterProperty) {
        if (this.selectedTags[filterProperty] === undefined || this.selectedTags[filterProperty] === null)
            this.selectedTags[filterProperty] = {};
        if (filterValue === "" || filterDisplay.length === 0)
            return;
        this.selectedTags[filterProperty][filterValue] = filterDisplay;
        var tag = (new Coral.Tag).set({
            label: {
                innerHTML: filterDisplay
            },
            value: filterValue
        });
        var tagList = this.tagList;
        this.tagList.on("coral-collection:add.authoring-taglist", function() {
            $(tag).find("input[type\x3dhidden]").attr("name", filterProperty);
            tagList.off("coral-collection:add.authoring-taglist")
        });
        Coral.commons.ready(this.tagList, function(tagList) {
            tagList.items.add(tag)
        })
    }
    ;
    ns.ui.TagList.prototype._removeTagFilter = function(filterProperty, containerProp) {
        if (containerProp !== undefined && this.selectedTags[containerProp]) {
            if (!delete this.selectedTags[containerProp][filterProperty])
                throw new Error("Asset filter cannot be deleted!");
        } else if (this.selectedTags[filterProperty])
            if (!delete this.selectedTags[filterProperty])
                throw new Error("Asset filter cannot be deleted!");
        Coral.commons.ready(this.tagList, function(tagList) {
            var tags = tagList.items.getAll();
            for (var i = 0; i < tags.length; i++)
                if (tags[i].value === filterProperty)
                    tagList.items.remove(tags[i])
        })
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    function setCurrentComponentGroup(group) {
        var self = ns.ui.componentBrowser;
        self.currentGroup = self.$elComponentGroup.get(0).selectedItem === null ? self.COMPONENT_GROUPS["ALL"] : self.$elComponentGroup.find("coral-select-item:selected").val()
    }
    function getSearchKeyword() {
        return ns.ui.componentBrowser.$search.val().trim()
    }
    function appendGroup(group, attributes) {
        var self = ns.ui.componentBrowser;
        if (group.indexOf(".") === 0)
            return;
        self.$elComponentGroup[0].items.add({
            content: {
                innerHTML: Granite.I18n.getVar(group)
            },
            value: group
        })
    }
    function createComponentGroupList() {
        var self = ns.ui.componentBrowser;
        ns.components.allowedComponents.sort(ns.components.sortComponents);
        self.$elComponentGroup[0].items.clear();
        appendGroup(self.COMPONENT_GROUPS["ALL"], {
            "data-all": true
        });
        var groups = [];
        $.each(ns.components.allowedComponents, function(i, component) {
            var group = component.getGroup();
            if (group && $.inArray(group, groups) === -1) {
                appendGroup(group);
                groups.push(group)
            }
        })
    }
    function redraw(event) {
        var self = ns.ui.componentBrowser;
        var panelRepositioned = event.type === "cq-sidepanel-resized";
        if ($(".sidepanel-opened").length && (self.tabIsActive() || panelRepositioned)) {
            createComponentGroupList();
            setCurrentComponentGroup(self.currentGroup);
            self.handleFilterComponents(event)
        }
    }
    function setContentPanelHeight() {
        var self = ns.ui.componentBrowser;
        var h = $(window).height();
        var offset = self.$elContentPanel.offset();
        self.$elContentPanel.height(h - offset.top)
    }
    ns.ui.componentBrowser = function() {
        var self = {};
        self.idSidePanel = "SidePanel";
        self.id = "editor-ComponentBrowser";
        self.initDOMVars = function() {
            self.$sidePanel = $("#" + self.idSidePanel);
            self.$el = self.$sidePanel.find("." + self.id);
            self.$header = self.$sidePanel.find(".sidepanel-header");
            self.$elFilterPanel = self.$el.find(".filter-panel");
            self.$elContentPanel = self.$el.find(".editor-SidePanel-results");
            self.$clear = self.$el.find("[data-editor-searchfilter-search]").parent(".coral-DecoratedTextfield").find(".coral-DecoratedTextfield-button");
            self.$icon = self.$el.find("[data-editor-searchfilter-search]").parent(".coral-DecoratedTextfield").find(".coral-DecoratedTextfield-icon");
            self.$search = self.$el.find("[data-editor-searchfilter-search]");
            self.$elComponentGroup = self.$el.find("[data-editor-searchfilter-group]")
        }
        ;
        self.COMPONENT_GROUPS = {
            ALL: "All",
            GENERAL: "General"
        };
        self.defaultGroup = self.COMPONENT_GROUPS.ALL;
        self.currentGroup = self.defaultGroup;
        self.handleFilterComponents = function(event) {
            var componentsFiltered = event.type === "cq-sidepanel-tab-switched";
            self.filterComponents({
                keepItems: false,
                clearFilter: componentsFiltered
            });
            if (!self.$elContentPanel.is(":visible") && componentsFiltered)
                self.$el.trigger("resize")
        }
        ;
        self.tabIsActive = function() {
            return self.$sidePanel.hasClass("sidepanel-opened") && $("coral-tab:selected").attr("aria-controls") === self.$el.parents("coral-panel").attr("id") && self.$el.parents(".js-SidePanel-content").is(":visible")
        }
        ;
        self.filterComponents = function(options) {
            options = options || {};
            var group = self.currentGroup;
            var keyword;
            if (options.clearFilter) {
                keyword = "";
                self.$search.val(keyword)
            } else
                keyword = getSearchKeyword();
            var $list = self.$el.find("coral-list.editor-ComponentBrowser-components");
            if ($list.length)
                $list[0].remove();
            self.list = new Coral.List;
            $(self.list).addClass("editor-ComponentBrowser-components");
            var hasResults = false;
            $.each(ns.components.allowedComponents, function(i, component) {
                var display = group === self.COMPONENT_GROUPS["ALL"] || group === component.getGroup();
                if (display && keyword) {
                    var componentTitle = (Granite.I18n.getVar(component.getTitle()) || "").toLowerCase();
                    keyword = String(keyword).toLowerCase();
                    display = componentTitle.indexOf(keyword) !== -1
                }
                if (group)
                    display = group.indexOf(".") !== 0 ? display : null;
                if (display) {
                    hasResults = true;
                    var content = new Coral.List.Item.Content;
                    content.appendChild(component.toHtml());
                    self.list.items.add((new Coral.List.Item).set({
                        content: content
                    }))
                }
            });
            var resultMessage = self.$el.find(".editor-SidePanel-resultMessage");
            if (!hasResults) {
                resultMessage.attr("role", "alert");
                setTimeout(function() {
                    resultMessage.removeAttr("role")
                }, 2E3)
            }
            resultMessage.toggle(!hasResults);
            setContentPanelHeight();
            self.$elContentPanel.append(self.list)
        }
        ;
        function init() {
            channel.on("cq-components-store-cleaned", function() {
                self.$elComponentGroup.find("coral-select").empty()
            });
            channel.on("cq-components-filtered cq-sidepanel-tab-switched cq-sidepanel-resized", $.throttle(250, false, redraw));
            $(window).on("resize", function(event) {
                if ($(".sidepanel-opened").length)
                    self.handleFilterComponents(event)
            });
            self.$elComponentGroup.on("click", function(event) {
                if ($(event.target).data("value"))
                    self.$elComponentGroup.find("select").trigger("change")
            });
            self.$elComponentGroup.on("change", function(event) {
                var group = $(event.target).find("coral-select-item:selected").val();
                if (group) {
                    setCurrentComponentGroup(group);
                    self.filterComponents()
                }
            });
            self.$elFilterPanel.find(".collapsible").on("activate deactivate", function(event) {
                setContentPanelHeight()
            });
            self.$search.on("keydown", function(event) {
                var keycode = Granite.Util.getKeyCode(event);
                if (keycode === 13)
                    self.filterComponents()
            }).on("keyup", function() {
                if (!$(this).val().trim().length)
                    self.filterComponents()
            });
            self.$search.on("click", "button", function() {
                self.filterComponents()
            });
            self.$clear.on("click", function() {
                if (getSearchKeyword().length)
                    self.filterComponents({
                        clearFilter: true
                    })
            });
            self.$icon.attr("alt", "");
            window.addEventListener("load", function() {
                self.$clear.find("coral-icon").attr("alt", "")
            })
        }
        channel.one("cq-sidepanel-loaded", function() {
            self.initDOMVars();
            if (self.$el.length > 0)
                init()
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.assetFinder = function() {
        var self = {};
        var dataSize = 20;
        var defaultLimit = 20;
        var dataSizeS7 = 100;
        var defaultLimitS7 = 100;
        var startLimit = 0;
        var endLimit = defaultLimit;
        var currentController = "";
        var eventTypeLoad = "loadAssets";
        var isDataLoaded = false;
        var isAllDataLoaded = false;
        var spinnerVisible = false;
        var offscrollTimer = null;
        var $elSelectedFilters;
        var $elContentPanel;
        var $elAssetType;
        var $elS7Conf;
        var $elContent;
        var $search;
        var $elSearch;
        var $clear;
        var $pathFields;
        var $taglist;
        var $taglistClearAll;
        var $spinner;
        var $elSearchNoResults;
        var $sidepanelTabTitle;
        var LOAD_MORE_ASSETS_MARGIN = 10;
        self.registry = {};
        self.$sidePanel = $("#SidePanel");
        var editPanel = null;
        Object.defineProperty(self, "$editPanel", {
            get: function() {
                Granite.author.util.deprecated();
                return editPanel
            },
            set: function(value) {
                Granite.author.util.deprecated();
                editPanel = value
            }
        });
        var tabName = "editor-AssetFinder";
        Object.defineProperty(self, "tabName", {
            get: function() {
                Granite.author.util.deprecated();
                return tabName
            },
            set: function(value) {
                Granite.author.util.deprecated();
                tabName = value
            }
        });
        self.$el = null;
        self.initVars = function() {
            self.$editPanel = self.$sidePanel.find(".js-SidePanel-content--edit");
            self.$el = self.$sidePanel.find(".editor-AssetFinder,.sidepanel-tab-assets");
            $elSelectedFilters = self.$el.find(".rail-view.active .selected-filter-panel");
            $elContentPanel = self.$el.find(".content-panel");
            $elAssetType = self.$el.find(".rail-view.active .assetfilter.type");
            $elS7Conf = self.$el.find(".rail-view.active .assetfilter.s7");
            $elContent = $elContentPanel.find(".assetfinder-content-container");
            $search = self.$el.find("#assetsearch");
            $elSearch = $search;
            $clear = self.$el.find("[data-editor-searchfilter-search]").parent(".coral-DecoratedTextfield").find(".coral-DecoratedTextfield-button");
            $pathFields = self.$el.find("foundation-autocomplete.path");
            $taglist = self.$el.find(".rail-view.active coral-taglist.taglist");
            $taglistClearAll = self.$el.find(".rail-view.active .taglist-clearall");
            $spinner = self.$el.find(".resultspinner");
            $elSearchNoResults = self.$el.find(".emptyresult");
            self.TagList = new ns.ui.TagList($taglist);
            $sidepanelTabTitle = self.$el.find(".sidepanel-tab-title")
        }
        ;
        var GRID_LAYOUT_SETTINGS = {
            colWidth: 145,
            gutterX: 14,
            selector: "article.card-asset"
        };
        var MASONRY_LAYOUT_SETTINGS = {
            layout: "variable",
            columnWidth: 140,
            spacing: 15
        };
        self.TagList = null;
        self.register = function(name, controller) {
            self.registry[name] = controller
        }
        ;
        var utilsCommons = {
            RANGE_DELIMITER: "..",
            loadAssets: function(appendData) {
                $elContent.trigger({
                    type: eventTypeLoad,
                    append: appendData
                })
            },
            resetAssets: function() {
                utilsCommons.filters.resetFulltextSearch();
                utilsCommons.filters.resetPathFields();
                utilsCommons.filters.resetFilters();
                if (isDataLoaded)
                    utilsCommons.loadAssets(false)
            },
            sidePanelIsOpened: function() {
                return self.$sidePanel.hasClass("sidepanel-opened")
            },
            tabIsActive: function() {
                return utilsCommons.sidePanelIsOpened() && $("coral-tab:selected").attr("aria-controls") === self.$el.parents("coral-panel").attr("id") && self.$el.parents(".js-SidePanel-content").is(":visible")
            },
            setContentPanelHeight: function() {
                Granite.author.util.deprecated();
                var h = $(window).height()
                  , offset = $elContentPanel.offset();
                $elContentPanel.height(Math.round(h - offset.top))
            },
            grid: {
                getCardView: function() {
                    return CUI.CardView.get($elContent)
                },
                setCardView: function() {
                    var cardView = utilsCommons.grid.getCardView();
                    cardView.setDisplayMode(CUI.CardView.DISPLAY_GRID);
                    if (ns.device.isDesktop())
                        utilsCommons.grid.adaptCardLayout(cardView, GRID_LAYOUT_SETTINGS);
                    else
                        utilsCommons.grid.adaptCardLayout(cardView, $.extend({}, GRID_LAYOUT_SETTINGS, {
                            "colWidth": 200
                        }));
                    $elContent.find("a.label").on("click", function(event) {
                        event.preventDefault()
                    })
                },
                adaptCardLayout: function(cardView, settings) {
                    cardView.layout(settings)
                }
            },
            filters: {
                _addAssetTypeEntry: function(name, $selectList) {
                    if ($selectList)
                        Coral.commons.ready($selectList.get(0), function() {
                            var item = {
                                value: name,
                                content: {
                                    innerHTML: Granite.I18n.getVar(name)
                                }
                            };
                            var items = $selectList.get(0).items;
                            items.add(item)
                        });
                    else {
                        var $li = $("\x3coption/\x3e", {
                            value: name,
                            text: text
                        });
                        var $nativeSelectList = $elAssetType.find("select");
                        $li.appendTo($nativeSelectList)
                    }
                },
                addTypeSelectorEntry: function(name) {
                    if (!$elAssetType.length)
                        return;
                    var $scene7AssetFilterEl = $("coral-select[name\x3dassetfilter_s7_selector]");
                    if (name === "Scene7" && $scene7AssetFilterEl.length)
                        Coral.commons.ready($scene7AssetFilterEl[0], function() {
                            if ($scene7AssetFilterEl[0].items.length > 0)
                                self.utilsCommons.filters._addAssetTypeEntry(name, $elAssetType)
                        });
                    else
                        self.utilsCommons.filters._addAssetTypeEntry(name, $elAssetType)
                },
                handleVisibilityClearAllAction: function() {
                    self.TagList.getValues().then(function(values) {
                        self.utilsCommons.filters.setVisibilityClearAll(values.length > 0)
                    })
                },
                setVisibilityClearAll: function(show) {
                    if (show) {
                        $taglist.prop("labelled", Granite.I18n.get("Filters"));
                        $taglist.before($taglistClearAll);
                        $taglistClearAll.show()
                    } else
                        $taglistClearAll.hide()
                },
                resetFulltextSearch: function() {
                    if ($elSearch.length)
                        $elSearch.val("")
                },
                resetPathFields: function() {
                    if (self.registry[currentController] && typeof self.registry[currentController].resetSearchPath === "function")
                        self.registry[currentController].resetSearchPath();
                    $pathFields.each(function() {
                        this.value = ""
                    })
                },
                resetFilters: function() {
                    self.TagList.clearAll();
                    utilsCommons.filters.setVisibilityClearAll(false)
                }
            }
        };
        Object.defineProperty(utilsCommons.filters, "resetPathBrowsers", {
            get: function() {
                Granite.author.util.deprecated();
                return utilsCommons.filters.resetPathFields
            },
            set: function(value) {
                Granite.author.util.deprecated();
                utilsCommons.filters.resetPathFields = value
            }
        });
        self.utilsCommons = utilsCommons;
        function handleSidepanelSwitch(event) {
            if (utilsCommons.tabIsActive(event))
                self.TagList.getValues().then(function(values) {
                    utilsCommons.filters.setVisibilityClearAll(values.length);
                    if (!isDataLoaded) {
                        utilsCommons.loadAssets(false);
                        isDataLoaded = true
                    } else
                        utilsCommons.grid.setCardView()
                })
        }
        function handleSidepanelResize(event) {
            if (utilsCommons.tabIsActive(event))
                utilsCommons.grid.setCardView()
        }
        function handleLoadAssets(event) {
            var appendData = event.append;
            if (!appendData) {
                _resetInternal();
                _resetGrid()
            }
            _displayData(appendData);
            function _resetInternal() {
                startLimit = 0;
                var assetType = getAssetType();
                if (assetType === "Scene7")
                    endLimit = defaultLimitS7;
                else
                    endLimit = defaultLimit;
                isAllDataLoaded = false
            }
            function _resetGrid() {
                utilsCommons.grid.getCardView().removeAllItems()
            }
            function _displayData(appendData) {
                var $pathField;
                var path;
                if (self.registry[currentController]) {
                    $pathField = $pathFields.filter('[data-filtertype\x3d"' + currentController + '"]:visible');
                    $elSearchNoResults.hide();
                    _showSpinner();
                    if ($pathField.length && typeof self.registry[currentController].setSearchPath === "function") {
                        path = $pathField.get(0).values[0];
                        if (path === undefined || !path || path.indexOf("://") === -1)
                            self.registry[currentController].setSearchPath(path)
                    }
                    if (self.registry[currentController]["searchCallback"] != null)
                        self.registry[currentController]["searchCallback"].abort();
                    self.registry[currentController]["searchCallback"] = self.registry[currentController].loadAssets(_createQuery(), startLimit, endLimit);
                    self.registry[currentController]["searchCallback"].then(function(htmlResponse) {
                        $elSearchNoResults.hide();
                        _insertDataToMasonry(htmlResponse, appendData);
                        _insertDataToGrid(htmlResponse, appendData);
                        utilsCommons.grid.setCardView();
                        startLimit = endLimit;
                        endLimit = endLimit + getAssetPageSize()
                    }).fail(function(req, status, error) {
                        if (status !== "abort") {
                            console.log("Error while getting assets", req, status, error);
                            $elSearchNoResults.attr("role", "alert");
                            $elSearchNoResults.show();
                            setTimeout(function() {
                                $elSearchNoResults.removeAttr("role")
                            }, 2E3)
                        }
                    }).always(function(req, status, error) {
                        if (status !== "abort") {
                            _hideSpinner();
                            self.registry[currentController]["searchCallback"] = null
                        }
                    })
                }
            }
            function _createQuery() {
                var query = "";
                var fulltextSearch = "";
                if ($elSearch.length && $elSearch.val().length) {
                    fulltextSearch = $elSearch.val().trim();
                    fulltextSearch = fulltextSearch.replace(/"/g, '\\"')
                }
                if (fulltextSearch.length)
                    query = query.concat(fulltextSearch + " ");
                var assetType = getAssetType();
                var s7conf = $elS7Conf[0].value;
                if (assetType === "Scene7" && s7conf !== null)
                    query = query.concat('"s7conf":"' + s7conf + '" ');
                var selectedFilters = self.TagList.getSelectedTags();
                for (var property in selectedFilters)
                    $.map(selectedFilters[property], function(value, key) {
                        try {
                            var keys = JSON.parse(key);
                            keys.forEach(function(key) {
                                if (query && query.indexOf(property) >= 0)
                                    query = query + "OR ";
                                query = query.concat('"' + property + '":"' + key + '" ')
                            })
                        } catch (exception) {
                            if (query && query.indexOf(property) >= 0)
                                query = query + "OR ";
                            query = query.concat('"' + property + '":"' + key + '" ')
                        }
                    });
                return query
            }
            function _insertDataToGrid(htmlResponse, appendData) {
                var parsedResponse = $.parseHTML(htmlResponse)
                  , $elData = $(parsedResponse).filter("article").toArray()
                  , $elDataCoralCard = $(parsedResponse).filter("coral-card").toArray();
                if ($elDataCoralCard.length)
                    return;
                var $masonry = self.$el.find("coral-masonry");
                if (!appendData && $masonry.length)
                    $masonry.remove();
                isAllDataLoaded = $elData.length < endLimit - startLimit;
                if (!appendData)
                    _resetGrid();
                if ($elData.length)
                    utilsCommons.grid.getCardView().append($elData);
                else if (!startLimit && !$elData.length) {
                    $elSearchNoResults.attr("role", "alert");
                    $elSearchNoResults.show();
                    setTimeout(function() {
                        $elSearchNoResults.removeAttr("role")
                    }, 2E3)
                }
            }
            function _getMasonry(appendData) {
                var $masonry = self.$el.find("coral-masonry")
                  , masonry = $masonry[0]
                  , $grid = self.$el.find("div.editor-SidePanel-masonryContainer")
                  , grid = $grid[0];
                if (!appendData) {
                    if (masonry) {
                        masonry.remove();
                        masonry = undefined
                    }
                    if (grid) {
                        grid.remove();
                        grid = undefined
                    }
                }
                if (!masonry) {
                    masonry = (new Coral.Masonry).set(MASONRY_LAYOUT_SETTINGS);
                    Granite.author.ui.assetFinder.masonry = masonry;
                    if (!grid) {
                        grid = document.createElement("div");
                        grid.className = "editor-SidePanel-masonryContainer"
                    }
                    $elContentPanel.append(grid);
                    grid.appendChild(masonry);
                    $sidepanelTabTitle[0].id = $sidepanelTabTitle[0].id || Coral.commons.getUID();
                    masonry.setAttribute("aria-labelledby", $sidepanelTabTitle[0].id);
                    masonry.setAttribute("ariaGrid", "on");
                    $(masonry).on("focus", "coral-masonry-item, coral-masonry-item button", function(e) {
                        var $masonryItem = $(e.target).closest("coral-masonry-item");
                        if (!$masonryItem.is(e.target)) {
                            var focusEvent = new FocusEvent("focus",{
                                view: window,
                                bubbles: true,
                                cancelable: true
                            });
                            $masonryItem[0].dispatchEvent(focusEvent)
                        }
                        $masonryItem.find("button").prop("tabIndex", 0)
                    });
                    $(masonry).on("blur", "coral-masonry-item, coral-masonry-item button", function(e) {
                        var $masonryItems = $(e.target).closest("coral-masonry").find("coral-masonry-item");
                        window.requestAnimationFrame(function() {
                            $masonryItems.each(function() {
                                var $masonryItem = $(this);
                                $masonryItem.find("button").prop("tabIndex", $masonryItem.prop("tabIndex"))
                            })
                        })
                    })
                }
                return masonry
            }
            function _insertDataToMasonry(htmlResponse, appendData) {
                var parsedResponse = $.parseHTML(htmlResponse)
                  , $elData = $(parsedResponse).filter("coral-card").toArray()
                  , $elDataArticle = $(parsedResponse).filter("article").toArray();
                if ($elDataArticle.length)
                    return;
                if (!appendData)
                    _resetGrid();
                isAllDataLoaded = $elData.length < endLimit - startLimit;
                self.$el.find(".foundation-layout-masonry-empty").toggle(true);
                self.masonry = _getMasonry(appendData);
                if ($elData.length) {
                    $elData.forEach(function(card) {
                        self.masonry.items.add({
                            content: {
                                innerHTML: card.outerHTML
                            }
                        })
                    });
                    self.$el.find(".editor-SidePanel-resultMessage").toggle(false);
                    if (ns.device.isIE11)
                        $(self.masonry).find("object").css("display", "none")
                } else if (!startLimit && !$elData.length) {
                    $elSearchNoResults.attr("role", "alert");
                    $elSearchNoResults.show();
                    setTimeout(function() {
                        $elSearchNoResults.removeAttr("role")
                    }, 2E3)
                }
            }
            function _showSpinner() {
                spinnerVisible = true;
                var $parent = $spinner.parent();
                $spinner = $spinner.detach();
                $parent.append($spinner);
                $spinner.attr("role", "alert");
                $spinner.show();
                var parentTop = $parent.position().top
                  , parentBottom = parentTop + $parent.height()
                  , h = $(window).height();
                if (parentTop <= h && parentBottom >= 0)
                    $spinner[0].scrollIntoView(false)
            }
            function _hideSpinner() {
                var noResultsFound = $(".editor-AssetFinder .emptyresult:visible").length;
                var masonryItems = Granite.author.ui.assetFinder.masonry.querySelectorAll("coral-masonry-item");
                var allItemsReady = Array.from(masonryItems).filter(function(el) {
                    return window.getComputedStyle(el).opacity !== "1"
                }).length === 0;
                if (noResultsFound || allItemsReady) {
                    spinnerVisible = false;
                    $spinner.hide();
                    $spinner.removeAttr("role");
                    return
                }
                requestAnimationFrame(_hideSpinner)
            }
        }
        function handleResetAssets(event) {
            utilsCommons.resetAssets()
        }
        var getAssetType = function() {
            return $elAssetType.find("coral-select-item[selected]").val()
        };
        var getAssetPageSize = function() {
            if ("Scene7" === getAssetType())
                return dataSizeS7;
            return dataSize
        };
        function handleScroll(event) {
            var elem = $(event.currentTarget)
              , scrollTop = elem.scrollTop()
              , scrollHeight = elem.get(0).scrollHeight
              , clientHeight = elem.get(0).clientHeight;
            $.toe.off();
            if (offscrollTimer)
                clearTimeout(offscrollTimer);
            offscrollTimer = setTimeout(function() {
                $.toe.on();
                offscrollTimer = null
            }, 500);
            if (!spinnerVisible && scrollTop > 0 && scrollTop + clientHeight >= scrollHeight - LOAD_MORE_ASSETS_MARGIN)
                if (!isAllDataLoaded)
                    utilsCommons.loadAssets(true)
        }
        function handleInnerRail(event) {
            event.preventDefault();
            self.$el.find(".rail-switch \x3e nav.toolbar a").removeClass("active");
            self.$el.find(".rail-switch \x3e nav.toolbar i").removeClass("active");
            self.$el.find(".rail-view.active").removeClass("active");
            $(event.target).addClass("active");
            self.$el.find('.rail-view[data-view\x3d"' + $(this).data("view") + '"]').addClass("active").show();
            self.$el.find('.rail-view[data-view\x3d"' + $(this).data("view") + '"] i').addClass("active")
        }
        function handleAssetTypes(event) {
            var type = event.selected;
            if (!type)
                type = $(event.target).find("coral-select-item:selected").val();
            if (self.registry[currentController]) {
                if (self.registry[currentController] && typeof self.registry[currentController].tearDown === "function")
                    self.registry[currentController].tearDown();
                currentController = type;
                _setFilterVisibility(currentController);
                if (currentController === "Scene7")
                    handleS7Confs();
                else
                    utilsCommons.resetAssets();
                if (typeof self.registry[currentController].setUp === "function")
                    self.registry[currentController].setUp();
                if (!self.registry[currentController].viewInAdminRoot)
                    self.$el.addClass("editor-AssetFinder--noViewInAdmin");
                else
                    self.$el.removeClass("editor-AssetFinder--noViewInAdmin")
            }
            function _setFilterVisibility(type) {
                $(".rail-view.active #assetfinder-filter .coral-Form-fieldwrapper").each(function() {
                    $(this).not(".coral-Search--cqSearchPanel").hide()
                });
                var filtersClass = "assetfilter";
                $("." + filtersClass + ":not([data-filtertype\x3dGeneral])").hide();
                var $validFilters = $("." + filtersClass + '[data-filtertype\x3d"' + type + '"]');
                $validFilters.show();
                $validFilters.parent().show();
                self.TagList.getValues().then(function(values) {
                    if (ns.device.isDesktop())
                        if (values.length === 0)
                            $elSelectedFilters.hide();
                        else
                            $elSelectedFilters.show()
                })
            }
        }
        function handleS7Confs() {
            var confValue = $elS7Conf[0].value;
            _setFilterVisibility(confValue);
            utilsCommons.resetAssets();
            function _setFilterVisibility(confValue) {
                var filtersClass = "assetfilter";
                var $invalidFilters = $("." + filtersClass + "[data-s7confname]");
                $invalidFilters.hide();
                $invalidFilters.parent(".coral-Form-fieldwrapper").hide();
                var $validFilters = $("." + filtersClass + '[data-s7confname\x3d"' + confValue + '"]');
                $validFilters.show();
                $invalidFilters.parent().show()
            }
        }
        function handleFulltextSearch(event) {
            var keycode = Granite.Util.getKeyCode(event);
            if (keycode === 13)
                utilsCommons.loadAssets(false);
            else if ($(event.target).val().length === 0) {
                utilsCommons.filters.resetFulltextSearch();
                utilsCommons.loadAssets(false)
            }
        }
        function handleFulltextSearchClear(event) {
            event.preventDefault();
            utilsCommons.filters.resetFulltextSearch();
            utilsCommons.loadAssets(false)
        }
        function handleTags(event) {
            if (ns.device.isDesktop())
                if (event.type == "coral-collection:add")
                    $elSelectedFilters.show();
                else {
                    if (event.type == "coral-collection:remove")
                        self.TagList.getValues().then(function(values) {
                            if (values === [])
                                $elSelectedFilters.hide()
                        })
                }
            else if (!$elSelectedFilters.is(":visible"))
                $elSelectedFilters.show()
        }
        function initPathFields() {
            var namespace = "author-assetfinder-pathfield";
            var timeout;
            var delay = 500;
            var onFieldChange = function() {
                utilsCommons.loadAssets(false)
            };
            $pathFields.each(function() {
                var $pathField = $(this);
                $pathField.off("foundation-field-change." + namespace).on("foundation-field-change." + namespace, onFieldChange).off("keydown." + namespace).on("keydown." + namespace, function(event) {
                    $pathField.off("foundation-field-change")
                }).off("keyup." + namespace).on("keyup." + namespace, function(event) {
                    var keycode = Granite.Util.getKeyCode(event);
                    clearTimeout(timeout);
                    timeout = setTimeout(function() {
                        $pathField.on("foundation-field-change", onFieldChange)
                    }, delay);
                    if (keycode === 13)
                        utilsCommons.loadAssets(false)
                })
            })
        }
        function initAssetTypeSelectList() {
            var entries = [];
            for (var assetType in self.registry)
                if (self.registry.hasOwnProperty(assetType))
                    entries.push(assetType);
            entries.sort(function(a, b) {
                var indexOfA = ns.config.assetTypeOrder.indexOf(a);
                var indexOfB = ns.config.assetTypeOrder.indexOf(b);
                if (indexOfA === -1)
                    return indexOfB;
                else if (indexOfB === -1)
                    return indexOfA;
                else
                    return indexOfA - indexOfB
            });
            entries.forEach(utilsCommons.filters.addTypeSelectorEntry)
        }
        function init() {
            if (!self.$el)
                self.initVars();
            if (self.$el.length === 0)
                return;
            initAssetTypeSelectList();
            currentController = currentController ? currentController : Object.keys(self.registry)[0];
            handleAssetTypes({
                selected: currentController,
                preventReset: true
            });
            initPathFields();
            $elContent.on(eventTypeLoad, $.debounce(125, false, handleLoadAssets));
            $elContentPanel.on("scroll", handleScroll);
            $elAssetType.on("change", handleAssetTypes);
            $taglist.on("coral-collection:remove coral-collection:add", handleTags);
            $elSearch.on("keyup", handleFulltextSearch);
            $clear.on("click", handleFulltextSearchClear);
            $clear.find("coral-icon").removeAttr("role aria-label");
            $taglistClearAll.find("button").on("click", handleResetAssets);
            $elS7Conf.on("change", handleS7Confs);
            channel.on("cq-sidepanel-tab-switched", handleSidepanelSwitch);
            channel.on("cq-sidepanel-resized", handleSidepanelResize);
            $(window).on("resize", $.debounce(125, false, handleSidepanelResize));
            channel.on("click", ".editor-Card-viewInAdmin", function(event) {
                var $card = $(event.currentTarget).parents(".editor-Card-asset").first();
                var viewInAdminURL;
                if ($card.length && self.registry[currentController] && self.registry[currentController].viewInAdminRoot) {
                    viewInAdminURL = Granite.URITemplate.expand(self.registry[currentController].viewInAdminRoot, {
                        item: $card.data("path")
                    });
                    ns.util.open(Granite.HTTP.externalize(viewInAdminURL))
                }
            });
            self.$el.find(".rail-switch \x3e nav.toolbar a").on("click", handleInnerRail)
        }
        channel.one("cq-sidepanel-loaded", init);
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.ContentTree = ns.util.createClass({
        constructor: function(config) {
            this.container = config.container;
            this.editables = config.editables;
            this.dataModel = null;
            this.tree = null
        },
        render: function(editables) {
            var self = this;
            this._unbindListeners();
            this.tree = new Coral.Tree;
            if (editables)
                this.editables = editables;
            this.dataModel = this._createDataModel(this.editables);
            this.dataModel.forEach(function(element) {
                self._renderElement(element, self.tree)
            });
            this.tree.expandAll();
            this.container.innerHTML = "";
            this.container.appendChild(this.tree);
            this._bindListeners()
        },
        init: function() {
            var self = this;
            channel.on("cq-sidepanel-tab-switched", function(event) {
                if (event.tabName === ns.ui.SidePanel.TAB_CLASSES.CONTENT)
                    self.render(ns.editables)
            })
        },
        _renderElement: function(element, tree) {
            var self = this;
            if (element.constructor === Array) {
                var head = element[0];
                var tail = element.slice(1, element.length);
                var subTree = this._addToTree(head, tree);
                if (tail.length > 0)
                    tail.forEach(function(tailElement) {
                        self._renderElement(tailElement, subTree)
                    });
                return subTree
            } else
                return this._addToTree(element, tree, false)
        },
        _addToTree: function(element, tree, isContainer) {
            var button = new Coral.Button;
            button.set({
                variant: "quiet",
                icon: "wrench",
                iconSize: "XS",
                title: Granite.I18n.get("Configure"),
                hidden: true
            });
            button.classList.add("editor-ContentTree-openDialog", "js-editor-ContentTree-openDialog");
            button.setAttribute("coral-interactive", "");
            var item = tree.items.add({
                value: element.value,
                content: {
                    innerHTML: '\x3cspan class\x3d"editor-ContentTree-item u-coral-ellipsis"\x3e' + element.title + "\x3c/span\x3e"
                }
            });
            item.appendChild(button);
            if (isContainer !== undefined && !isContainer)
                item.setAttribute("variant", Coral.Tree.Item.variant.LEAF);
            return item
        },
        _getElementTitle: function(editable, componentTitle) {
            componentTitle = Granite.I18n.getVar(componentTitle);
            var title = "";
            if (!editable.config.isContainer && editable.dom)
                title = ns.util.getFirstVisibleTextContent(editable.dom[0]);
            if (title !== "") {
                var helperTempDiv = document.createElement("div");
                helperTempDiv.textContent = title;
                if (helperTempDiv.textContent.length > 200) {
                    helperTempDiv.textContent = helperTempDiv.textContent.substring(0, 200);
                    helperTempDiv.innerHTML += "\x26hellip;"
                }
                title = '\x3cspan class\x3d"editor-ContentTree-itemTitle"\x3e' + componentTitle + ": \x3c/span\x3e" + helperTempDiv.innerHTML
            } else
                title = '\x3cspan class\x3d"editor-ContentTree-itemTitle"\x3e' + componentTitle + "\x3c/span\x3e";
            return title
        },
        _bindListeners: function() {
            var self = this;
            var tree = this.tree;
            tree.on("coral-tree:change.content-tree", function(event) {
                var selectedItem = tree.selectedItem;
                if (selectedItem) {
                    var editable = self.editables.find(selectedItem.value)[0];
                    if (editable && editable.overlay && editable.overlay.dom && !editable.overlay.isDisabled() && !editable.overlay.isSelected())
                        editable.overlay.dom.focus().trigger("click");
                    var query = document.querySelectorAll(".js-editor-ContentTree-openDialog");
                    for (var i = 0; i < query.length; ++i)
                        query[i].setAttribute("hidden", "");
                    if (ns.EditorFrame.editableToolbar && ns.EditorFrame.editableToolbar.checkActionCondition("CONFIGURE", editable)) {
                        var openDialog = selectedItem.querySelector(".js-editor-ContentTree-openDialog");
                        if (openDialog)
                            openDialog.removeAttribute("hidden")
                    }
                }
            });
            channel.on("cq-interaction-focus.content-tree", function(event) {
                if (!$(tree).is(":visible"))
                    return;
                var editable = event.editable;
                if (editable && editable.path) {
                    var treeItem = tree.items.getAll().filter(function(item) {
                        return item.value === editable.path
                    })[0];
                    if (treeItem && !treeItem.selected) {
                        tree.items._deselectAllExceptFirst();
                        treeItem.selected = true;
                        var treeItemParent = treeItem.parent;
                        while (treeItemParent && treeItemParent.constructor && treeItemParent.constructor === Coral.Tree.Item) {
                            treeItemParent.setAttribute("expanded", "");
                            treeItemParent = treeItemParent.parent
                        }
                    }
                }
            });
            channel.on("click.content-tree-open-dialog", ".js-editor-ContentTree-openDialog", function(event) {
                var treeItem = event.currentTarget.closest("coral-tree-item");
                var editable = self.editables.find(treeItem.value)[0];
                if (editable)
                    if (ns.EditorFrame.editableToolbar && ns.EditorFrame.editableToolbar.checkActionCondition("CONFIGURE", editable))
                        ns.EditorFrame.editableToolbar.config.actions.CONFIGURE.execute(editable)
            });
            channel.on("cq-editables-updated.content-tree", $.debounce(500, false, function() {
                if (ns.ui.SidePanel.isOpened() === true && ns.ui.SidePanel.getSelectedTabClass() === ns.ui.SidePanel.TAB_CLASSES.CONTENT)
                    self.render(ns.editables)
            }))
        },
        _unbindListeners: function() {
            channel.off("cq-interaction-focus.content-tree");
            if (this.tree)
                this.tree.off("coral-tree:change.content-tree");
            channel.off("click.content-tree-open-dialog");
            channel.off("cq-editables-updated.content-tree")
        },
        _createDataModel: function(editables) {
            var self = this;
            var model = [];
            var added = {};
            editables.forEach(function(editable) {
                self._addToDataModel(model, editable, added)
            });
            return model
        },
        _addToDataModel: function(model, editable, added) {
            var self = this;
            var modelData;
            if (added[editable.path])
                return;
            if (!this._isDisplayable(editable))
                return;
            if (editable.isContainer()) {
                var subModel = [];
                var children = editable.getChildren();
                modelData = this._adaptToDataModel(editable);
                if (modelData) {
                    subModel.push(modelData);
                    children.forEach(function(child) {
                        self._addToDataModel(subModel, child, added)
                    });
                    model.push(subModel);
                    added[editable.path] = true
                }
            } else {
                modelData = this._adaptToDataModel(editable);
                if (modelData) {
                    model.push(modelData);
                    added[editable.path] = true
                }
            }
        },
        _isDisplayable: function(editable) {
            return editable instanceof ns.Editable && (editable.isContainer() || editable.hasActionsAvailable() && !editable.isNewSection())
        },
        _adaptToDataModel: function(editable) {
            var component = ns.components.find({
                resourceType: editable.type
            })[0];
            if (component)
                return {
                    value: editable.path,
                    title: this._getElementTitle(editable, component.getTitle()),
                    editable: editable
                };
            return null
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    function isMimeTypeAccepted(origin, target) {
        var groups = JSON.parse(target.attr("data-asset-groups") || "[]");
        if ($.inArray(origin.attr("data-asset-group"), groups) === -1)
            return false;
        var accept = target.attr("data-asset-accept") ? JSON.parse(target.attr("data-asset-accept")) : null;
        var originMimeType = origin.attr("data-asset-mimetype");
        if (accept && originMimeType) {
            for (var i = 0, length = accept.length; i < length; i++)
                if ((new RegExp(accept[i])).test(originMimeType))
                    return true;
            return false
        }
        return true
    }
    ns.ui.assetFinder.AssetDragAndDrop = function() {}
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.getTypeName = function() {
        return "Assets"
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype._getComponentMapping = function(event) {
        var origin = $(event.origin), editable = event.currentDropTarget.targetEditable, parent = ns.editables.getParent(editable), authoringConfig = ns.editableHelper.getStyleProperty(parent, "cq:authoring", true), mapping = authoringConfig ? authoringConfig["assetToComponentMapping"] : null, originGroup = origin.attr("data-asset-group"), originMimetype = origin.attr("data-asset-mimetype"), entry, assetGroup, assetMimetype, mimetypeMatch;
        for (var k in mapping) {
            entry = mapping[k];
            if (entry.assetGroup && originGroup) {
                assetGroup = $.isArray(entry.assetGroup) ? entry.assetGroup : [entry.assetGroup];
                if (entry.assetGroup.indexOf(originGroup) === -1)
                    continue
            }
            if (entry.assetMimetype && originMimetype) {
                assetMimetype = $.isArray(entry.assetMimetype) ? entry.assetMimetype : [entry.assetMimetype];
                mimetypeMatch = assetMimetype.filter(function(mimetype) {
                    return (new RegExp(mimetype)).test(originMimetype)
                });
                if (mimetypeMatch.length === 0)
                    continue
            }
            return entry
        }
        return null
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.createComponent = function(event) {
        var mapping = this._getComponentMapping(event)
          , editableNeighbor = event.currentDropTarget.targetEditable
          , insertBehavior = event.currentDropTarget.insertBehavior;
        if (!mapping)
            return;
        var component = ns.components.find({
            resourceType: mapping.resourceType
        })[0];
        if (!component)
            return;
        var dropTarget = component.getDropTarget(mapping.droptarget);
        var properties = this.prepareProperties(event, dropTarget);
        return ns.edit.EditableActions.INSERT.execute(component, insertBehavior, editableNeighbor, null, properties)
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.prepareProperties = function(event, dropTarget) {
        var properties = {};
        properties[dropTarget.name] = event.path;
        for (var j in dropTarget.params)
            if (dropTarget.params.hasOwnProperty(j))
                properties[j] = dropTarget.params[j];
        for (var j in event.param)
            if (event.param.hasOwnProperty(j))
                properties[j] = event.param[j];
        return properties
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.handleDragStart = function(event) {
        event.preventDefault();
        ns.selection.deselectAll();
        channel.trigger($.Event("cq-asset-dragstart", {
            asset: $(event.origin)
        }));
        if (!ns.device.isDesktop())
            setTimeout(function() {
                ns.ui.SidePanel.close()
            }, 100);
        ns.ui.dropController.enableDropzone("asset");
        ns.ui.dropController.enableDropzone("component")
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.handleDragEnd = function(event) {
        ns.ui.dropController.disableDropzone("asset");
        ns.ui.dropController.enableDropzone("component");
        channel.trigger($.Event("cq-asset-dragend", {
            asset: $(event.origin)
        }))
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.handleDrop = function(event) {
        var editable = event.currentDropTarget.targetEditable, dropTargetId = $(event.target).attr("data-asset-id"), dropTarget, properties;
        function updateParagraphStep(data) {
            var originalData;
            try {
                originalData = JSON.parse(data)
            } catch (ex) {
                originalData = {}
            }
            ns.edit.EditableActions.UPDATE.execute(editable, properties).then(function() {
                ns.history.util.Utils.addUpdateParagraphStep(editable.path, editable.type, originalData, properties);
                channel.trigger($.Event("cq-asset-dropped", {
                    path: properties["./fileReference"]
                }))
            })
        }
        if (!dropTargetId) {
            if (this.createComponent(event))
                channel.trigger($.Event("cq-asset-dropped", {
                    path: $(event.origin).attr("data-path")
                }))
        } else {
            dropTarget = editable.getDropTarget(dropTargetId);
            properties = this.prepareProperties(event, dropTarget);
            ns.persistence.readParagraphContent(editable).always(updateParagraphStep)
        }
    }
    ;
    ns.ui.assetFinder.AssetDragAndDrop.prototype.isInsertAllowed = function(event) {
        var target = $(event.target);
        var origin = $(event.origin);
        var isAssetDropTarget = !!target.attr("data-asset-id");
        var targetEditable = event.currentDropTarget.targetEditable;
        if (isAssetDropTarget) {
            if (!ns.edit.EditableActions.UPDATE.condition(targetEditable))
                return false;
            return isMimeTypeAccepted(origin, target)
        } else if (ns.editables.getParent(targetEditable)) {
            var mapping = this._getComponentMapping(event), component;
            if (mapping) {
                component = ns.components.find({
                    resourceType: mapping.resourceType
                })[0];
                if (component)
                    return ns.edit.EditableActions.INSERT.condition(event.currentDropTarget.targetEditable, component.componentConfig.path, "group:" + component.componentConfig.group)
            }
        }
        return false
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.ComponentDragAndDrop = function() {}
    ;
    ns.ui.ComponentDragAndDrop.prototype.getTypeName = function() {
        return ns.Component.prototype.getTypeName()
    }
    ;
    ns.ui.ComponentDragAndDrop.prototype.handleDragStart = function(event) {
        if (!ns.device.isDesktop())
            setTimeout(function() {
                ns.ui.SidePanel.close()
            }, 100);
        ns.ui.dropController.enableDropzone("component")
    }
    ;
    ns.ui.ComponentDragAndDrop.prototype.handleDrop = function(event) {
        var components = ns.components.find($(event.origin).attr("data-path"))
          , editableNeighbor = event.currentDropTarget.targetEditable
          , insertBehavior = event.currentDropTarget.insertBehavior;
        if (components.length > 0)
            ns.edit.EditableActions.INSERT.execute(components[0], insertBehavior, editableNeighbor)
    }
    ;
    ns.ui.ComponentDragAndDrop.prototype.handleDragEnd = function(event) {
        ns.ui.dropController.disableDropzone("component")
    }
    ;
    ns.ui.ComponentDragAndDrop.prototype.isInsertAllowed = function(event) {
        var component = ns.components.find({
            path: event.path
        })[0]
          , componentPath = component.getPath()
          , componentGroup = "group:" + component.getGroup();
        return ns.edit.EditableActions.INSERT.condition(event.currentDropTarget.targetEditable, componentPath, componentGroup)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.ui.EditableDragAndDrop = function() {}
    ;
    ns.util.inherits(ns.ui.EditableDragAndDrop, ns.ui.ComponentDragAndDrop);
    ns.ui.EditableDragAndDrop.prototype.getTypeName = function() {
        return ns.Editable.prototype.getTypeName()
    }
    ;
    ns.ui.EditableDragAndDrop.prototype.getDragImage = function(dragstate) {
        var editable = ns.editables.find({
            path: dragstate.path
        })
          , img = editable[0].dom.find(".cq-dd-image")[0];
        if (img)
            return ns.util.cloneToIndependentNode(img);
        img = $(".cq-dd-default");
        return $("\x3cimg/\x3e", {
            src: img.attr("src"),
            height: img.height(),
            width: img.width()
        })[0]
    }
    ;
    ns.ui.EditableDragAndDrop.prototype.handleDrop = function(event) {
        var editable = ns.editables.find({
            path: event.path
        })[0]
          , editableNeighbor = event.currentDropTarget.targetEditable
          , insertBehavior = event.currentDropTarget.insertBehavior
          , historyStep = undefined
          , historyEnabled = ns.history.Manager.isEnabled()
          , editables = ns.selection.getAllSelected();
        ns.history.util.Utils.getNeighborPath(editable, insertBehavior).then(function(data) {
            if (historyEnabled && data.neighborPath != editableNeighbor.path)
                historyStep = ns.history.util.Utils.beginStep();
            var historyConfig = {
                "step": historyStep
            };
            if (editables.length > 1)
                ns.editableHelper.doBulkOperation(ns.edit.EditableActions.MOVE.execute, [ns.persistence.PARAGRAPH_ORDER.before, editableNeighbor, historyConfig], editables).then(function() {
                    if (historyStep)
                        ns.history.util.Utils.finalizeStep(historyStep)
                });
            else
                ns.edit.EditableActions.MOVE.execute(editable, insertBehavior, editableNeighbor, historyConfig).then(function() {
                    if (historyStep)
                        ns.history.util.Utils.finalizeStep(historyStep)
                })
        })
    }
    ;
    ns.ui.EditableDragAndDrop.prototype.isInsertAllowed = function(event) {
        var dragObject = ns.editables.find({
            path: event.path
        })[0]
          , component = ns.components.find({
            resourceType: dragObject.type
        })[0]
          , componentPath = component.getPath()
          , componentGroup = "group:" + component.getGroup();
        return ns.edit.EditableActions.INSERT.condition(event.currentDropTarget.targetEditable, componentPath, componentGroup)
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.EditorFrame = function() {
        var self = {};
        var headLinkElements = [];
        self.editorVanityURL = "editor.html";
        self.editorVanityRegex = /(\/)(editor)([^\/]*)(\.html)(\/)/g;
        self.$doc = $(document);
        self.container = self.$doc.find("#ContentWrapper");
        self.editableToolbar = undefined;
        function clearHeadLinks() {
            for (var i = 0; i < headLinkElements.length; i++)
                $(headLinkElements[i]).remove();
            headLinkElements.length = 0
        }
        function updateLinksFromIframe(event) {
            var head = $("head");
            clearHeadLinks();
            for (var i = 0, length = event.linkElements.length; i < length; ++i) {
                var l = event.linkElements[i];
                var linkElem = document.createElement("link");
                linkElem.rel = l.rel;
                linkElem.href = l.href;
                linkElem.type = l.type;
                linkElem.title = l.title;
                headLinkElements.push(linkElem);
                head[0].appendChild(linkElem)
            }
        }
        function getResourceLocation() {
            return window.location.pathname.replace(self.editorVanityRegex, "/")
        }
        function refreshUrlFromIframe(contentFrameLocation, pageTitle) {
            if (ns.config.preventUrlRefresh)
                return;
            if (getResourceLocation() !== contentFrameLocation) {
                var contextPath = Granite.HTTP.getContextPath();
                var isContextPathPresent = contentFrameLocation.indexOf(contextPath) !== -1;
                var newLocation;
                if (isContextPathPresent)
                    newLocation = contentFrameLocation.replace(contextPath, contextPath + "/" + self.editorVanityURL);
                else
                    newLocation = "/" + self.editorVanityURL + contentFrameLocation;
                History.pushState(null, pageTitle, newLocation)
            }
        }
        self.refreshUrlFromIframe = refreshUrlFromIframe;
        function updateDocumentFromIframe(event) {
            if (ns.EditorFrame.$doc.length > 0)
                ns.EditorFrame.$doc.get(0).title = event.title;
            updateLinksFromIframe(event);
            refreshUrlFromIframe(event.location, event.title)
        }
        function onHistoryStateChange() {
            var resourceLocation = window.location.pathname.replace(self.editorVanityURL + "/", "");
            if (window.location.search)
                resourceLocation += window.location.search;
            channel.trigger($.Event("cq-editor-content-location-changed", {
                location: resourceLocation
            }))
        }
        self.init = function() {
            History.Adapter.bind(window, "statechange", onHistoryStateChange);
            channel.on("cq-content-frame-loaded", updateDocumentFromIframe)
        }
        ;
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.OverlayWrapper = {
        $el: $("#OverlayWrapper"),
        hide: function() {
            this.$el.css("display", "none")
        },
        show: function() {
            this.$el.css("display", "")
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.actions = {}
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.on("click", ".pageinfo-edittemplate", function() {
        var templatePath = ns.pageInfo.editableTemplate;
        if (templatePath) {
            var url = "/editor.html" + templatePath + "/structure.html";
            ns.util.open(Granite.HTTP.externalize(url))
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.actions.viewAsPublished = function() {
        window.open(ns.ContentFrame.location + "?wcmmode\x3ddisabled")
    }
    ;
    channel.on("click", ".pageinfo-viewaspublished", function() {
        ns.actions.viewAsPublished()
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.actions.viewInAdmin = function(contentPath, adminURL) {
        adminURL = typeof adminURL === "string" && adminURL.length > 0 ? adminURL : "/sites.html";
        var parentPath = contentPath ? contentPath.substring(0, contentPath.lastIndexOf("/")) : "";
        var url = Granite.HTTP.externalize(adminURL + parentPath + "#" + contentPath);
        if (!url.startsWith("/")) {
            console.error("Refuse to redirect to given admin URL. Potentially malicious content.");
            return
        }
        ns.util.open(url)
    }
    ;
    channel.on("click", ".pageinfo-adminview", function() {
        var contentPath = document.querySelector(".foundation-content-path").dataset.foundationContentPath;
        var adminURL = document.querySelector(".pageinfo-adminview").dataset.adminurl;
        contentPath = contentPath.replace(/\.html$/, "");
        ns.actions.viewInAdmin(contentPath, adminURL)
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.actions.AUTHORING_UI_MODE = {
        CLASSIC: "CLASSIC",
        TOUCH: "TOUCH"
    };
    ns.actions.changeAuthoringUIMode = function(authoringUIMode) {
        if (ns.actions.AUTHORING_UI_MODE.hasOwnProperty(authoringUIMode))
            $.cookie("cq-authoring-mode", authoringUIMode, {
                path: Granite.HTTP.externalize("/"),
                expires: 7
            })
    }
    ;
    channel.on("click", ".classicui-switcher", function() {
        var newLocation = Granite.HTTP.externalize($(document).find(".foundation-authoring-ui-mode").data("classic-editor-url") + ns.pageInfo.status.path + ".html");
        ns.actions.changeAuthoringUIMode(ns.actions.AUTHORING_UI_MODE.CLASSIC);
        window.location = newLocation
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var PROPERTIES_ACTIVATOR_SELECTOR = ".properties-activator";
    ns.actions.openPageProperties = function(el) {
        var propertiesActivator = el || document.querySelector(PROPERTIES_ACTIVATOR_SELECTOR);
        if (!propertiesActivator)
            return;
        var path = propertiesActivator.dataset.path;
        if (!path)
            return;
        if (path.startsWith("/") || path.startsWith("http"))
            window.location.href = Granite.HTTP.externalize(path);
        else
            console.warn("Suspicious path was detected (" + path + ")")
    }
    ;
    ns.actions.PagePropertiesDialog = function(src) {
        Granite.author.util.deprecated();
        this._src = src
    }
    ;
    ns.util.inherits(ns.actions.PagePropertiesDialog, ns.ui.Dialog);
    ns.actions.PagePropertiesDialog.prototype.getConfig = function() {
        return {
            src: this._src,
            loadingMode: "auto",
            layout: "auto"
        }
    }
    ;
    ns.actions.PagePropertiesDialog.prototype.onSuccess = function() {
        window.location.reload()
    }
    ;
    ns.actions.PagePropertiesDialog.openDialog = function(el) {
        ns.actions.openPageProperties(el)
    }
    ;
    channel.on("click", PROPERTIES_ACTIVATOR_SELECTOR, function() {
        ns.actions.openPageProperties(this)
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var DOCUMENT_REFERRER_KEY = "document.referrer";
    var $trigger = $("#pageinfo-trigger"), pageInfoDataSelector = "#pageinfo-data", popover = $("#pageinfo-popover")[0], contentPath;
    var queryParameters = {};
    function loadPageInfo() {
        if (typeof contentPath === "undefined")
            return;
        var pageInfoPath = $(pageInfoDataSelector).data("path");
        var url = pageInfoPath + ".html" + Granite.HTTP.internalize(contentPath);
        CUI.util.state.setSessionItem(DOCUMENT_REFERRER_KEY, location.href);
        $.ajax({
            type: "GET",
            dataType: "html",
            url: url,
            data: queryParameters
        }).then(function(data) {
            $(pageInfoDataSelector).replaceWith(data);
            $(pageInfoDataSelector).attr("role", "list");
            $(pageInfoDataSelector).find(".js-editor-PageInfo-closePopover").attr("role", "listitem")
        })
    }
    channel.on("cq-content-frame-loaded", function(event) {
        contentPath = ns.ContentFrame.currentLocation();
        contentPath = contentPath.substring(0, contentPath.length - 5);
        if (ns.pageInfo && ns.pageInfo.enableFragmentIdentifier === true && event.fragmentIdentifierPath)
            queryParameters["fragmentIdentifierPath"] = event.fragmentIdentifierPath;
        if ($trigger.length)
            $trigger[0].disabled = false
    });
    $trigger.on("mouseenter touchstart", $.throttle(1E3, loadPageInfo));
    channel.on("cq-content-frame-unload", function() {
        if ($trigger.length)
            $trigger[0].disabled = true;
        if (typeof popover !== "undefined" && popover.open)
            popover.open = false
    });
    channel.on("click", ".js-editor-PageInfo-closePopover", function(event) {
        popover.open = false
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    (function() {
        channel.on("click", ".promotelaunch-activator", function() {
            var path = $(this).data("promotewizardurl");
            if (path.startsWith("/") || path.startsWith("http"))
                window.location.href = Granite.HTTP.externalize(path);
            else
                console.warn("Suspicious path was detected (" + path + ")")
        })
    }
    )()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var START_WORKFLOW_ACTIVATOR_SELECTOR = ".js-editor-WorkflowStart-activator";
    var START_WORKFLOW_SELECTOR = ".js-cq-WorkflowStart";
    var START_WORKFLOW_TITLE_SELECTOR = ".js-cq-WorkflowStart-title";
    var START_WORKFLOW_PAYLOAD_SELECTOR = START_WORKFLOW_SELECTOR + " input[name\x3dpayload]";
    var START_WORKFLOW_LIST_SELECTOR = ".js-cq-WorkflowStart-select";
    var START_WORKFLOW_SUBMIT_SELECTOR = ".js-cq-WorkflowStart-submit";
    var START_WORKFLOW_LIST_CONTAINER_ID = "workflow-select";
    var startWorkflowModal = document.querySelector(START_WORKFLOW_SELECTOR);
    var submitButton = document.querySelector(START_WORKFLOW_SUBMIT_SELECTOR);
    var startWorkflowListContainer = document.getElementById(START_WORKFLOW_LIST_CONTAINER_ID);
    channel.on("click", START_WORKFLOW_ACTIVATOR_SELECTOR, function(event) {
        if (!startWorkflowModal)
            return;
        var workflowList = document.querySelector(START_WORKFLOW_LIST_SELECTOR);
        if (workflowList) {
            document.querySelector(START_WORKFLOW_TITLE_SELECTOR).value = "";
            var payload = Granite.HTTP.internalize(ns.ContentFrame.getContentPath());
            document.querySelector(START_WORKFLOW_PAYLOAD_SELECTOR).value = payload;
            workflowList.value = "";
            startWorkflowModal.show()
        } else
            $.ajax({
                url: "/libs/cq/gui/content/common/listworkflows.html",
                type: "GET",
                dataType: "html"
            }).then(function(html) {
                if (startWorkflowListContainer)
                    startWorkflowListContainer.insertAdjacentHTML("afterend", html);
                startWorkflowModal.show();
                onStartWorkflowListSelectorChange()
            });
        submitButton.disabled = "disabled"
    });
    channel.on("click", START_WORKFLOW_SUBMIT_SELECTOR, function(event) {
        var button = $(event.currentTarget);
        button.attr("disabled", "disabled");
        var form = button.closest("form");
        var promise = $.ajax({
            url: form.attr("action"),
            type: form.attr("method") || "POST",
            dataType: "html",
            data: form.serialize()
        });
        promise.then(function() {
            startWorkflowModal.hide();
            channel.one("cq-editor-loaded.workflow-started", function() {
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("Workflow Started"),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.INFO
                })
            });
            ns.ContentFrame.reload()
        }).fail(function(jqXHR) {
            var errorMsg = Granite.I18n.getVar($(jqXHR.responseText).find("#Message").html());
            if (jqXHR.status == 403)
                errorMsg = Granite.I18n.get("Your CSFR token may have expired.  Refresh the page or login again.");
            ns.ui.helpers.notify({
                content: Granite.I18n.get("The workflow failed to start. ") + errorMsg,
                type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
            })
        })
    });
    $(document).on("foundation-contentloaded", function() {
        onStartWorkflowListSelectorChange()
    });
    function onStartWorkflowListSelectorChange() {
        $(START_WORKFLOW_LIST_SELECTOR).on("change", function(event) {
            if (!event.target.selectedItem)
                submitButton.setAttribute("disabled", "disabled");
            else
                submitButton.removeAttribute("disabled")
        })
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var ADMIN = "admin"
      , lockUrl = Granite.HTTP.internalize("/bin/wcmcommand");
    function switchLockMode(isLockOwner) {
        var overlayWrapper = $(document).find("#OverlayWrapper");
        if (!isLockOwner) {
            ns.ContentFrame.showFullScreenMask(true);
            ns.ContentFrame.showPlaceholder(false);
            overlayWrapper.css("display", "none")
        } else {
            ns.ContentFrame.showFullScreenMask(false);
            ns.ContentFrame.showPlaceholder(true);
            overlayWrapper.css("display", "")
        }
    }
    function setLockStatus(path, locked) {
        var promise = $.ajax(lockUrl, {
            "type": "POST",
            "data": {
                "_charset_": "UTF-8",
                "path": path,
                "cmd": locked ? "lockPage" : "unlockPage"
            }
        });
        promise.then(function() {
            ns.ui.helpers.notify({
                content: Granite.I18n.get("The page has been {0}", [locked ? Granite.I18n.get("locked") : Granite.I18n.get("unlocked")]),
                type: ns.ui.helpers.NOTIFICATION_TYPES.INFO,
                closable: false
            });
            ns.loadPageInfo()
        }).fail(function(jqXHR) {
            var errorMsg = Granite.I18n.getVar($(jqXHR.responseText).find("#Message").html());
            ns.ui.helpers.notify({
                content: errorMsg,
                type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
            })
        })
    }
    function lockPage() {
        setLockStatus(ns.pageInfo.status.path, !ns.pageInfo.status.isLocked)
    }
    function unlockPage() {
        var isLockOwner = ns.ContentFrame && ns.ContentFrame.contentWindow.CQ.shared.User.data.userID === ns.pageInfo.status.lockOwner
          , canUnlock = ns.pageInfo.status.canUnlock || ns.ContentFrame.contentWindow.CQ.shared.User.data.userID === ADMIN;
        if (ns.pageInfo.status.isLocked && canUnlock) {
            var pagePath = ns.pageInfo.status.path;
            ns.ui.helpers.prompt({
                title: Granite.I18n.get("Locked page"),
                message: isLockOwner ? Granite.I18n.get("You currently locked this page, which prevents other users from editing it.") : Granite.I18n.get('You cannot edit this page as it is currently locked by \x3cspan class\x3d"bolded"\x3e{0}\x3c/span\x3e.', [ns.pageInfo.status.lockOwner]),
                type: ns.ui.helpers.PROMPT_TYPES.ERROR,
                actions: [{
                    text: Granite.I18n.get("Cancel", "Label for Cancel button"),
                    id: "CANCEL"
                }, {
                    text: isLockOwner ? Granite.I18n.get("Unlock page") : Granite.I18n.get("Break lock"),
                    id: "UNLOCK",
                    warning: true
                }],
                callback: function(actionId) {
                    if (actionId === "UNLOCK")
                        setLockStatus(pagePath, false)
                }
            })
        } else
            ns.ui.helpers.prompt({
                title: Granite.I18n.get("Locked page"),
                message: Granite.I18n.get("You cannot edit this page as it is currently edited by \x3cspan class\x3d'bolded'\x3e{0}\x3c/span\x3e. \x3cbr/\x3ePlease contact administrators for assistance.", [ns.pageInfo.status.lockOwner]),
                type: ns.ui.helpers.PROMPT_TYPES.ERROR,
                actions: [{
                    id: "OK",
                    text: Granite.I18n.get("OK", "Label for OK button")
                }]
            })
    }
    channel.on("cq-page-info-loaded", function(event) {
        var CQ = ns.ContentFrame && ns.ContentFrame.contentWindow && ns.ContentFrame.contentWindow.CQ;
        if (CQ && CQ.shared && CQ.shared.User && CQ.shared.User.data == undefined)
            CQ.shared.User.load();
        $("#unlock-page-trigger").prop("disabled", !event.info.status.isLocked)
    });
    $(document).on("click", ".cq-author-unlock-page", unlockPage);
    $(document).on("click", ".cq-author-lock-page", lockPage)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, httpHelpers, undefined) {
    var DOCUMENT_REFERRER_KEY = "document.referrer";
    function navigateToPublishWizard(activator, path, editMode, schedule) {
        var params = "";
        if (path && typeof path === "string" && path.length > 0)
            params += "item\x3d" + path;
        if (params.length > 0) {
            var url = activator.data("url") + "?" + params + (editMode ? "\x26editmode" : "") + (schedule ? "\x26later" : "");
            if ((new URL(url,document.baseURI)).origin !== "null")
                location.href = url
        }
    }
    function quickPublish(activator, path, editMode, schedule) {
        var referencesUrl = activator.data("references-url");
        $.ajax(referencesUrl, {
            "data": {
                path: path
            },
            "type": "POST",
            "cache": false,
            "dataType": "json"
        }).then(function(data) {
            if (data && data.assets && data.assets.length == 0) {
                if (schedule) {
                    navigateToPublishWizard(activator, path, editMode, schedule);
                    return
                }
                $.ajax(activator.data("replication-url"), {
                    "type": "POST",
                    "data": {
                        "_charset_": "utf-8",
                        "cmd": "Activate",
                        "path": path
                    }
                }).then(function() {
                    ns.ui.helpers.notify({
                        content: Granite.I18n.get("The page has been published"),
                        type: ns.ui.helpers.NOTIFICATION_TYPES.INFO
                    })
                }, function(data) {
                    ns.ui.helpers.notify({
                        content: Granite.I18n.get("Failed to publish the selected page(s)."),
                        type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                    })
                })
            } else
                navigateToPublishWizard(activator, path, editMode, schedule)
        }, function() {
            ns.ui.helpers.notify({
                content: Granite.I18n.get("Failed to retrieve references for the selected page."),
                type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
            })
        })
    }
    channel.on("click.quickpublish", ".cq-authoring-actions-quickpublish-activator", function() {
        CUI.util.state.setSessionItem(DOCUMENT_REFERRER_KEY, location.href);
        var activator = $(this);
        var path = httpHelpers.getPath(activator.data("path"));
        var editMode = activator.data("edit") || false;
        var schedule = activator.data("later") || false;
        quickPublish(activator, path, editMode, schedule)
    });
    channel.on("cq-page-info-loaded", function(event) {
        var pageInfo = event.pageInfo;
        if (sessionStorage.getItem("cq-page-published-message")) {
            sessionStorage.removeItem("cq-page-published-message");
            var message = null;
            if (pageInfo.workflow.isRunning)
                message = Granite.I18n.get("The page is pending approval");
            else if (pageInfo.status.replication.action == "ACTIVATE")
                message = Granite.I18n.get("The page has been published");
            else if (pageInfo.status.replication.action == "DEACTIVATE")
                message = Granite.I18n.get("The page has been unpublished");
            if (message != null) {
                $(".pageinfo .popover").hide();
                ns.ui.helpers.notify({
                    content: message,
                    type: ns.ui.helpers.NOTIFICATION_TYPES.INFO
                })
            }
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this, Granite.HTTP);
(function($, ns, channel, window, undefined) {
    var DOCUMENT_REFERRER_KEY = "document.referrer";
    var ui = $(window).adaptTo("foundation-ui");
    function navigateToUnpublishWizard(activator, path, editMode, schedule) {
        var params = "";
        if (path && typeof path === "string" && path.length > 0 && (path.startsWith("/") || path.startsWith("http")))
            params += "item\x3d" + path;
        if (params.length > 0)
            location.href = activator.data("url") + "?" + params + (editMode ? "\x26editmode" : "") + (schedule ? "\x26later" : "")
    }
    function unpublish(path, replicationUrl) {
        $.ajax(replicationUrl, {
            "type": "POST",
            "data": {
                "_charset_": "utf-8",
                "cmd": "Deactivate",
                "path": path
            }
        }).then(function() {
            ns.ui.helpers.notify({
                content: Granite.I18n.get("The page has been unpublished"),
                type: ns.ui.helpers.NOTIFICATION_TYPES.INFO
            })
        }, function() {
            ns.ui.helpers.notify({
                content: Granite.I18n.get("Failed to unpublish the selected page(s)."),
                type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
            })
        })
    }
    var quickUnpublish = function($activator, path, editMode, schedule) {
        var dialog = $activator.closest("coral-dialog")[0];
        if (dialog)
            dialog.open = false;
        if (schedule) {
            navigateToUnpublishWizard($activator, path, editMode, schedule);
            return
        }
        $.ajax({
            url: $activator.data("references-url"),
            "type": "POST",
            data: {
                path: path,
                predicate: "wcmcontent"
            },
            cache: false,
            dataType: "json"
        }).then(function(json) {
            var published = false;
            $.each(json.pages, function(i, value) {
                if (json.pages[i].published)
                    published = true
            });
            if (published)
                ns.ui.helpers.prompt({
                    title: Granite.I18n.get("Unpublish"),
                    message: Granite.I18n.get("One or more pages are referenced."),
                    type: ns.ui.helpers.PROMPT_TYPES.WARNING,
                    actions: [{
                        text: Granite.I18n.get("Cancel")
                    }, {
                        text: Granite.I18n.get("Force Unpublish"),
                        warning: true,
                        handler: function() {
                            unpublish(path, $activator.data("replication-url"))
                        }
                    }]
                });
            else
                unpublish(path, $activator.data("replication-url"))
        }).fail(function(xhr) {
            var title = Granite.I18n.get("Error");
            var message = Granite.I18n.get("Failed to retrieve references for selected items.");
            ui.alert(title, message, "error")
        })
    };
    $(document).on("click.quickunpublish", ".cq-authoring-actions-quickunpublish-activator", function(e) {
        CUI.util.state.setSessionItem(DOCUMENT_REFERRER_KEY, location.href);
        var $activator = $(this);
        var path = $activator.data("path").replace(/\.html$/, "");
        var schedule = $activator.data("later") || false;
        var editMode = $activator.data("edit") || false;
        quickUnpublish($activator, path, editMode, schedule)
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    ns.clipboard = function() {
        var self = {}, localStorageItemId = "cq-editor-clipboard", localStorageCutItemId = "cq-editor-clipboard-cut", storage, shouldCut = false;
        function loadFromPersistentStorage() {
            storage = JSON.parse(localStorage.getItem(localStorageItemId) || "[]").map(function(path) {
                var editable = ns.editables.find(path)[0];
                if (!editable) {
                    editable = new ns.Editable({
                        path: path
                    });
                    ns.editableHelper.loadConfig(editable).then(function() {
                        if (editable.config.editConfig.actions.indexOf("COPY") === -1)
                            editable.config.editConfig.actions.push("COPY");
                        if (editable.config.editConfig.actions.indexOf("MOVE") === -1)
                            editable.config.editConfig.actions.push("MOVE")
                    })
                }
                return editable
            });
            self.length = storage.length;
            shouldCut = localStorage.getItem(localStorageCutItemId) === "true" || false
        }
        self.length = 0;
        self.getEditables = function() {
            return storage.slice()
        }
        ;
        self._setEditables = function(editables) {
            localStorage.setItem(localStorageItemId, JSON.stringify(editables.map(function(editable) {
                return editable.path
            })));
            loadFromPersistentStorage()
        }
        ;
        self.setEditablesToCopy = function(editables) {
            self._setShouldCut(false);
            self._setEditables(editables)
        }
        ;
        self.setEditablesToCut = function(editables) {
            self._setShouldCut(true);
            self._setEditables(editables)
        }
        ;
        self._setShouldCut = function(shouldCutBool) {
            shouldCut = shouldCutBool;
            if (shouldCut)
                localStorage.setItem(localStorageCutItemId, "true");
            else
                localStorage.removeItem(localStorageCutItemId)
        }
        ;
        self.shouldCut = function() {
            return shouldCut
        }
        ;
        self.clear = function() {
            self._setEditables([]);
            self._setShouldCut(false)
        }
        ;
        self.isEmpty = function() {
            return self.length === 0
        }
        ;
        loadFromPersistentStorage();
        $(window).on("focus", function() {
            loadFromPersistentStorage()
        });
        channel.on("cq-persistence-after-delete cq-persistence-after-move", function(event, editableDeleted) {
            var index = 0;
            var length = storage.length;
            var found = false;
            while (index < length && !found) {
                var editableStored = storage[index];
                if (editableStored.path === editableDeleted.path) {
                    found = true;
                    break
                }
                index += 1
            }
            if (found) {
                storage.splice(index, 1);
                self._setEditables(storage)
            }
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, document, undefined) {
    var ONBOARDING_HIGHLIGHT_BORDER_WIDTH = 4;
    function positionAndHighlight(targetEl, $highlight, $popover) {
        var width = targetEl.offsetWidth - ONBOARDING_HIGHLIGHT_BORDER_WIDTH;
        var height = targetEl.offsetHeight - ONBOARDING_HIGHLIGHT_BORDER_WIDTH;
        $highlight.width(width).height(height).removeClass("is-hidden");
        Coral.commons.ready($highlight, function() {
            $highlight.position({
                my: "left top",
                at: "left top",
                of: targetEl,
                collision: "none"
            })
        });
        $popover.position({
            my: "left top",
            at: "right+15 top",
            of: targetEl,
            collision: "flipfit"
        })
    }
    function isContainerElement(editable) {
        return ns.editables.isRootContainer(editable) || editable.isNewSection()
    }
    function getSuitableEditable(editables) {
        if (!editables || editables.length < 1)
            return;
        if (editables.length === 2)
            if (editables[1].isNewSection())
                return editables[0];
            else
                return editables[1];
        var higherEditable;
        for (var i = 0; i < editables.length; i++) {
            var editable = editables[i];
            if (!isContainerElement(editable)) {
                higherEditable = editable;
                break
            }
        }
        for (; i < editables.length; i++) {
            var editable = editables[i];
            if (!isContainerElement(editable) && editable.dom.offset().top < higherEditable.dom.offset().top)
                higherEditable = editable
        }
        return higherEditable
    }
    channel.on("editor-onboarding-beforestep", function(event) {
        var targetEl = event.targetEl;
        var $highlight = event.$highlight;
        var $popover = event.$popover;
        if (!targetEl || targetEl && !$(targetEl).is(":visible"))
            if (targetEl && targetEl.id === "EditableToolbar") {
                var editables = ns.editables.filter(function(editable) {
                    if (editable.canInPlaceEdit() || editable.hasActionsAvailable())
                        return true;
                    return false
                });
                if (editables && editables.length > 0) {
                    var editable = getSuitableEditable(editables);
                    if (editable) {
                        ns.selection.deselectAll();
                        ns.selection.deactivateCurrent();
                        ns.selection.select(editable);
                        ns.selection.activate(editable);
                        if (editable && editable.overlay && editable.overlay.dom && !editable.overlay.isSelected())
                            editable.overlay.dom.focus();
                        if (ns.EditorFrame.editableToolbar)
                            ns.EditorFrame.editableToolbar.open(editable)
                    }
                }
                positionAndHighlight(targetEl, $highlight, $popover)
            } else {
                $highlight.addClass("is-hidden");
                $popover.position({
                    my: "center",
                    at: "center",
                    of: window,
                    collision: "none"
                })
            }
        else
            positionAndHighlight(targetEl, $highlight, $popover)
    });
    channel.on("click", ".editor-shell-onboarding-trigger", function(event) {
        channel.trigger($.Event("editor-show-onboarding", {
            targetLayer: "Edit"
        }))
    });
    channel.one("cq-editor-loaded", function(event) {
        var showOnBoarding = document.querySelector("meta[name\x3d'granite.shell.showonboarding']");
        if (showOnBoarding && showOnBoarding.content === "true")
            window.requestAnimationFrame(function() {
                channel.trigger($.Event("editor-show-onboarding", {
                    targetLayer: "Edit"
                }))
            })
    })
}
)(jQuery, Granite.author, jQuery(document), this, document);
(function($, ns, channel, window, undefined) {
    var JSON_DATA_TYPE = "JSON";
    var PN_PAGEMODEL_PATH = ":path";
    var CONTENT_PATH_DELIMITER = "/jcr:content/";
    var findEditablesFunction;
    var editableConstructor;
    var pageModelRootPathCache;
    var getDocumentHeight = function(doc) {
        if (doc.body)
            return Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, doc.body.offsetHeight, doc.documentElement.offsetHeight);
        else
            return 0
    };
    function addEditable(editable, editables) {
        if (!editable || !editables)
            return;
        if (editable.isContainer()) {
            var containerPath = editable.path + "/";
            var firstChild = editables.filter(function(e) {
                return e.path.indexOf(containerPath) === 0
            })[0];
            if (firstChild) {
                var index = editables.indexOf(firstChild);
                editables.splice(index, 0, editable)
            } else
                editables.push(editable)
        } else
            editables.push(editable)
    }
    function _reloadEditable(editable) {
        var editableEditContext;
        var editables;
        var $dom = ns.ContentFrame.getEditableNode(editable.path);
        if (JSON_DATA_TYPE === ns.ContentFrame.dataType)
            editableEditContext = ns.editContext.getEditContext(editable.path);
        else {
            var configNode = ns.ContentFrame.getEditableConfigNode(editable.path);
            if (configNode)
                editableEditContext = ns.configParser(configNode.data("config"))
        }
        if (editableEditContext)
            editable.updateConfig(editableEditContext);
        editable.dom = $dom;
        editables = [editable];
        var newChildren;
        if (JSON_DATA_TYPE === ns.ContentFrame.dataType)
            newChildren = ns.ContentFrame.getEditables(editable.path);
        else
            newChildren = ns.ContentFrame.getEditables(editable.dom);
        newChildren = newChildren.filter(function(newEditable) {
            return newEditable.path !== editable.path
        });
        channel.trigger($.Event("cq-editables-update", {
            editables: editables,
            children: [newChildren]
        }));
        channel.trigger($.Event("cq-overlays-create", {
            editables: editables
        }))
    }
    ns.ContentFrame = function() {
        var self = {};
        self.wrapper = $("#ContentWrapper");
        self.scrollView = $("#ContentScrollView");
        self.iframe = $("iframe#ContentFrame");
        self.mask = $("#FullScreenMask");
        self.panelHeader = $(".js-editor-PanelHeader");
        self.contentWindow;
        self.topOffset;
        self.location = null;
        self.dataType = "HTML";
        self._EditableUtils = {
            shouldFilterEditable: function(editable) {
                return !!editable && !editable.isStructureLocked()
            }
        };
        self.init = function() {
            var iframeEl = self.iframe.get(0);
            var offset = self.iframe.offset();
            self.contentWindow = iframeEl && iframeEl.contentWindow;
            self.topOffset = offset && self.iframe.offset().top;
            ns.editContext.initializeCache();
            var remoteURL = ns.util.getValidURL(iframeEl.getAttribute("data-remoteurl"));
            if (remoteURL) {
                remoteURL.searchParams.append("cq:wcmmode", "edit");
                self.isRemoteApp = true;
                self.contentURL = remoteURL.href;
                self.contentOrigin = remoteURL.origin
            } else {
                self.contentURL = window.location.pathname.replace(ns.EditorFrame.editorVanityRegex, "/");
                if (window.location.search)
                    self.contentURL += window.location.search
            }
            self.showFullScreenMask(true);
            self.load(self.contentURL);
            self.messageChannel = new ns.MessageChannel("cqauthor",self.contentWindow,self.contentOrigin);
            self.messageChannel.subscribeRequestMessage("cq-contentframe-layout-change", $.debounce(100, function() {
                channel.trigger("cq-contentframe-layout-change")
            }));
            self.messageChannel.subscribeRequestMessage("cq-pagemodel-loaded", function(detail) {
                channel.trigger($.Event("cq-pagemodel-loaded", {
                    pageModel: detail.data.model
                }))
            });
            self.messageChannel.subscribeRequestMessage("cq-pagemodel-route-changed", function(detail) {
                channel.trigger($.Event("cq-pagemodel-route-changed", {
                    pagePath: detail.data.model[PN_PAGEMODEL_PATH],
                    title: detail.data.model.title
                }))
            });
            self.messageChannel.subscribeRequestMessage("cq-async-content-loaded", function() {
                channel.trigger($.Event("cq-async-content-loaded"))
            });
            channel.one("cq-editor-loaded", function() {
                if (ns.pageInfo && ns.pageInfo.enableFragmentIdentifier === true) {
                    self.executeCommand(null, "requestFragmentIdentifierChanges", null);
                    self.messageChannel.subscribeRequestMessage("cq-contentframe-fragment-identifier-change", function(event) {
                        channel.trigger($.Event("cq-content-frame-loaded", {
                            frame: self,
                            title: self.getTitle(),
                            linkElements: self.getLinkElements(),
                            location: self.contentWindow.location.pathname,
                            fragmentIdentifierPath: event.data.path
                        }))
                    })
                }
            })
        }
        ;
        self.load = function(url) {
            var pathname = ns.util.isValidPath(url) || ns.util.getValidURL(url) ? url : "";
            self.location = pathname;
            self.iframe.attr("src", pathname);
            self.iframe.attr("role", "presentation")
        }
        ;
        self.reload = function() {
            this.load(this.location)
        }
        ;
        self.currentLocation = function() {
            return self.location
        }
        ;
        self.getContentPath = function() {
            return self.location.replace(/\..*/, "")
        }
        ;
        self.getDocument = function() {
            return $(self.iframe.get(0).contentDocument)
        }
        ;
        self.getEditableNode = function(path) {
            if (!path)
                return null;
            if (JSON_DATA_TYPE === self.dataType) {
                var element = self.getDocument().get(0).querySelector('[data-cq-data-path\x3d"' + path + '"]');
                if (element)
                    return $(element);
                var chunks = path.split(new RegExp(CONTENT_PATH_DELIMITER));
                var pagePath = chunks.shift();
                var contentPath = chunks.join(CONTENT_PATH_DELIMITER);
                var selector = '[data-cq-page-path\x3d"' + pagePath + '"] [data-cq-data-path\x3d"' + contentPath + '"]';
                return $(self.getDocument().get(0).querySelector(selector))
            }
            var node = self.getEditableConfigNode(path);
            return node ? node.parent() : null
        }
        ;
        self.getEditableConfigNode = function(path) {
            var node = self.getDocument().find('cq[data-path\x3d"' + path + '"]');
            return node.length ? node : null
        }
        ;
        self.setFindEditablesFunction = function(func) {
            findEditablesFunction = func
        }
        ;
        self.setEditableConstructor = function(cons) {
            editableConstructor = cons
        }
        ;
        self.getEditables = function(root) {
            var editables = [];
            if (findEditablesFunction && typeof findEditablesFunction === "function")
                return findEditablesFunction.call(self, root);
            var editableConstruct = editableConstructor || ns.Editable;
            if (JSON_DATA_TYPE !== self.dataType) {
                root = root instanceof jQuery ? root : self.getDocument();
                root.find("cq").each(function(i, element) {
                    var editable = new editableConstruct(element);
                    addEditable(editable, editables)
                })
            } else {
                root = typeof root === "string" ? root : "/";
                if (ns.editContext.isCacheEmpty())
                    return editables;
                var elements = self.getDocument().get(0).querySelectorAll("[data-cq-data-path]");
                var rootRegExp = new RegExp("^" + root + "(?:/.*)?$");
                for (var i = 0, length = elements.length; i < length; i++) {
                    var element = elements[i];
                    var path = element.dataset.cqDataPath;
                    if (!path)
                        continue;
                    var editContext = ns.editContext.getEditContext(path);
                    if (!editContext && element.dataset.cqResourceType) {
                        ns.editContext.fetch(path, true, {
                            resourceType: element.dataset.cqResourceType
                        }, true);
                        editContext = ns.editContext.getEditContext(path)
                    }
                    if (!editContext || root !== "/" && !path.match(rootRegExp))
                        continue;
                    var editable = new editableConstruct(editContext,$(element));
                    if (self._EditableUtils.shouldFilterEditable(editable))
                        addEditable(editable, editables)
                }
            }
            return editables
        }
        ;
        self.reloadEditable = function(editable) {
            if (!editable || !editable.path)
                return $.Deferred().reject().promise();
            if (JSON_DATA_TYPE === self.dataType)
                return ns.editContext.fetch(editable.path, true).then(function(editContext) {
                    _reloadEditable(editable);
                    return editable
                });
            else {
                _reloadEditable(editable);
                return editable
            }
        }
        ;
        self.loadEditables = function() {
            var editables = self.getEditables();
            channel.trigger($.Event("cq-editables-loaded", {
                editables: editables
            }));
            return editables
        }
        ;
        self.loadEditablesAsync = function(forceReloadEditContext) {
            if (JSON_DATA_TYPE !== self.dataType)
                return $.Deferred().resolve(self.loadEditables()).promise();
            else {
                var layoutChangedDeferred = $.Deferred();
                if (pageModelRootPathCache)
                    layoutChangedDeferred.resolve();
                else
                    channel.one("cq-pagemodel-loaded", function() {
                        if (pageModelRootPathCache)
                            layoutChangedDeferred.resolve()
                    });
                return layoutChangedDeferred.then(function() {
                    var contentPath = self.getContentPath();
                    var promises = [];
                    if (pageModelRootPathCache && pageModelRootPathCache.length > 0 && pageModelRootPathCache !== contentPath) {
                        var pageModelPathDeferred = ns.editContext.fetch(pageModelRootPathCache, forceReloadEditContext);
                        promises.push(pageModelPathDeferred)
                    }
                    var contentPathDeferred = ns.editContext.fetch(undefined, forceReloadEditContext);
                    promises.push(contentPathDeferred);
                    return $.when.apply(this, promises).then(function() {
                        return ns.ContentFrame.loadEditables()
                    })
                })
            }
        }
        ;
        self.getTitle = function() {
            return self.getDocument().get(0).title
        }
        ;
        self.getLinkElements = function() {
            var links = self.getDocument().find("link"), ret = [], l, rel;
            for (var i = 0; i < links.length; i++) {
                l = links[i];
                rel = l.rel ? l.rel.toLowerCase() : "";
                if (rel.indexOf("icon") !== -1 || rel.indexOf("alternate") !== -1)
                    ret.push({
                        rel: l.rel,
                        href: l.href,
                        type: l.type,
                        title: l.title
                    })
            }
            return ret
        }
        ;
        self.resetContentHeight = function(autoHeight) {
            var document = self.getDocument().get(0);
            if (autoHeight === true)
                self.iframe[0].style.height = "auto";
            if (document)
                self.iframe[0].contentWindow.requestAnimationFrame(function() {
                    var currentHeight = self.iframe.height();
                    var iFrameContentHeight = getDocumentHeight(document);
                    var editorHeight = $(window).height() - self.topOffset;
                    if (iFrameContentHeight < editorHeight)
                        iFrameContentHeight = editorHeight;
                    if (currentHeight !== iFrameContentHeight) {
                        self.wrapper.height(iFrameContentHeight);
                        self.iframe.height(iFrameContentHeight)
                    }
                })
        }
        ;
        self.setSize = function(width, height) {
            self.setWidth(width);
            self.setHeight(height)
        }
        ;
        self.setWidth = function(width) {
            window.requestAnimationFrame(function() {
                self.iframe.width(width)
            })
        }
        ;
        self.setHeight = function(height) {
            window.requestAnimationFrame(function() {
                self.iframe.height(height)
            })
        }
        ;
        self.updateTopOffset = function() {
            self.setTopOffset(self.panelHeader.height())
        }
        ;
        self.setTopOffset = function(topOffset) {
            self.topOffset = topOffset;
            self.scrollView.css("top", topOffset)
        }
        ;
        self.executeCommand = function(path, command, data) {
            var def = $.Deferred();
            var promise = self.messageChannel.postMessage("cqauthor-cmd", {
                path: path,
                cmd: command,
                cmdData: data,
                dataType: self.dataType
            });
            function fwdMsg(d, action) {
                def[action](d.req, {
                    "cqauthor": d.res.id,
                    "cmd": d.res.data.cmd,
                    "path": d.res.data.path,
                    "data": d.res.data.cmdData,
                    "dataType": self.dataType
                }, d.res.data.cmdData)
            }
            promise.then(function(data) {
                fwdMsg(data, "resolve")
            }, function(data) {
                fwdMsg.bind("reject")
            });
            return def.promise()
        }
        ;
        self.showPlaceholder = function(condition) {
            ns.ContentFrame.executeCommand(null, "toggleClass", {
                className: "aem-Author--hidePlaceholder",
                condition: condition === false
            }).always(function() {
                self.resetContentHeight(true)
            })
        }
        ;
        self.showFullScreenMask = function(condition) {
            self.mask.toggle(condition)
        }
        ;
        self.getUserID = function() {
            return self.contentWindow && self.contentWindow.CQ && self.contentWindow.CQ.shared && self.contentWindow.CQ.shared.User && self.contentWindow.CQ.shared.User.data && self.contentWindow.CQ.shared.User.data.userID
        }
        ;
        self._onLoad = function(ev) {
            self.iframe[0].contentWindow.onunload = function() {
                channel.trigger("cq-content-frame-unload")
            }
            ;
            var samePage = self.location === self.contentWindow.location.pathname;
            try {
                self.location = self.contentWindow.location.pathname
            } catch (ex) {
                ns.ui.helpers.notify({
                    content: Granite.I18n.get("It seems like you are trying to edit an external site. We will redirect back to the referencing site."),
                    type: ns.ui.helpers.NOTIFICATION_TYPES.ERROR
                });
                self.load(self.currentLocation())
            }
            self.resetContentHeight();
            if (!samePage)
                self.scrollView.scrollTop(0);
            var dataTypeHintElement = self.iframe.get(0).contentDocument.querySelector('meta[property\x3d"cq:datatype"]');
            if (dataTypeHintElement) {
                self.dataType = dataTypeHintElement.content;
                channel.trigger($.Event("cq-contentframe-datatype-set", {
                    dataType: self.dataType
                }))
            }
            channel.trigger($.Event("cq-content-frame-loaded", {
                frame: self,
                title: self.getTitle(),
                linkElements: self.getLinkElements(),
                location: self.contentWindow.location.pathname
            }))
        }
        ;
        self._reloadEditables = function(pagePath) {
            var editables = self.getEditables(pagePath);
            channel.trigger($.Event("cq-editables-loaded", {
                editables: editables
            }));
            channel.trigger($.Event("cq-overlays-create", {
                editables: editables
            }))
        }
        ;
        self.iframe.on("load", self._onLoad);
        channel.on("cq-contentframe-layout-change", function() {
            self.resetContentHeight()
        });
        channel.on("cq-editor-content-location-changed", function(event) {
            if (event && event.location && event.location !== self.currentLocation())
                ns.ContentFrame.load(event.location)
        });
        channel.on("cq-pagemodel-loaded", function(data) {
            var pageModel = data && data.pageModel;
            pageModelRootPathCache = pageModel && pageModel[PN_PAGEMODEL_PATH] && Granite.HTTP.getPath(pageModel[PN_PAGEMODEL_PATH])
        });
        channel.on("cq-pagemodel-route-changed", function(event) {
            if (event.pagePath) {
                self.location = event.pagePath + ".html";
                ns.EditorFrame.refreshUrlFromIframe(self.location, event.title)
            }
            ns.editContext.fetch(event.pagePath).then(function() {
                self._reloadEditables(event.pagePath)
            })
        });
        channel.on("cq-async-content-loaded", function() {
            self._reloadEditables()
        });
        return self
    }()
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var editContextRequestCache = [];
    var editContextCache = {};
    ns.editContext = {
        initializeCache: function() {
            editContextCache = {};
            editContextRequestCache = []
        },
        getCache: function() {
            return editContextCache
        },
        isCacheEmpty: function() {
            return Object.getOwnPropertyNames(editContextCache).length < 1
        },
        getEditContext: function(path) {
            return editContextCache && editContextCache[path]
        },
        cacheRequestURL: function(requestURL) {
            if (!requestURL || requestURL.length < 1)
                return;
            editContextRequestCache && editContextRequestCache.push(requestURL)
        },
        updateCache: function(requestURL, editContext) {
            if (!requestURL || !editContext)
                return;
            var localEditContextCache;
            if (!ns.editContext.isCacheEmpty()) {
                localEditContextCache = ns.editContext.getCache();
                for (var key in editContext)
                    if (editContext.hasOwnProperty(key))
                        localEditContextCache[key] = ns.configParser(editContext[key])
            } else {
                localEditContextCache = editContext;
                for (var cacheKey in localEditContextCache)
                    if (localEditContextCache.hasOwnProperty(cacheKey))
                        localEditContextCache[cacheKey] = ns.configParser(localEditContextCache[cacheKey])
            }
            editContextCache = localEditContextCache;
            ns.editContext.cacheRequestURL(requestURL);
            return $.Deferred().resolve(localEditContextCache).promise()
        },
        buildEditContextPath: function(path, params) {
            var editContextPath = path ? path : ns.ContentFrame.getContentPath();
            var pathInfo = ns.util.getPathInfo(editContextPath);
            Object.assign(pathInfo.parameters, params);
            if (pathInfo.selectors.indexOf("editcontext") < 0)
                pathInfo.selectors.push("editcontext");
            if (pathInfo.extension !== "json")
                pathInfo.extension = "json";
            return pathInfo.toString()
        },
        fetch: function(path, forceReload, params, sync) {
            var requestPath = ns.editContext.buildEditContextPath(path, params);
            if (!forceReload && !ns.editContext.isCacheEmpty() && editContextRequestCache.indexOf(requestPath) > -1)
                return $.Deferred().resolve(editContextCache).promise();
            return $.ajax({
                type: "GET",
                url: requestPath,
                dataType: "json",
                async: !Boolean(sync)
            }).then(function(editContext) {
                var editContextPath = ns.editContext.buildEditContextPath(path);
                return ns.editContext.updateCache(editContextPath, editContext)
            }).fail(function() {
                throw new Error("Edit context could not be fetch due to an error in the edit context servlet");
            })
        }
    }
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel) {
    var PAGE_INFO_PROVIDER = "/libs/wcm/core/content/pageinfo.json";
    var PAGE_COMPONENTS_PROVIDER = "/libs/wcm/core/content/components.json";
    var loaderPromises = [];
    function validateInitConfig(config) {
        var validateMainMsg = "The editor requires a valid configuration object to be initialized with";
        if (!config)
            throw new Error(validateMainMsg);
        if (!config.name)
            throw new Error(validateMainMsg,"An editor name is mandatory");
    }
    function onContentFrameLoaded() {
        if (ns.config && ns.config.loaders) {
            for (var i = 0, length = ns.config.loaders.length; i < length; ++i)
                loaderPromises.push(ns.config.loaders[i]());
            $.when.apply(this, loaderPromises).done(function() {
                channel.trigger($.Event("cq-editor-loaded"));
                loaderPromises = []
            })
        }
    }
    ns.getLoaderPromise = function(position) {
        if (position < 0 || position >= loaderPromises.length) {
            console.log("Loader unavailable for position", position);
            return
        } else
            return loaderPromises[position]
    }
    ;
    ns.getPageInfoLocation = function() {
        var location = ns.ContentFrame.currentLocation();
        return location.replace(/\.html(\/.*)?$/, "")
    }
    ;
    ns.getPageDesignLocation = function(design) {
        return Granite.HTTP.externalize(design.path + "/_jcr_content." + design.lastModified + ".json")
    }
    ;
    ns.loadPageInfo = function(cache) {
        if (cache && ns.pageInfo)
            return $.Deferred().resolve(ns.pageInfo).promise();
        else {
            var pagePath = ns.getPageInfoLocation();
            return $.ajax({
                type: "GET",
                url: Granite.HTTP.externalize(PAGE_INFO_PROVIDER),
                data: {
                    path: Granite.HTTP.internalize(decodeURIComponent(pagePath)),
                    _charset_: "UTF-8"
                },
                dataType: "json"
            }).then(function(data) {
                channel.trigger($.Event("cq-page-info-loaded", {
                    info: data,
                    pageInfo: data
                }));
                return data
            }).fail(function() {
                throw new Error("Page info could not be loaded");
            })
        }
    }
    ;
    ns.loadPageDesign = function() {
        var $pageInfoPromise = ns.getLoaderPromise(0);
        if (!$pageInfoPromise)
            return $.Deferred().reject().promise();
        return $pageInfoPromise.then(function(pageInfo) {
            var url = ns.getPageDesignLocation(pageInfo.design);
            return $.ajax({
                type: "GET",
                url: url,
                dataType: "json"
            }).then(function(data) {
                channel.trigger($.Event("cq-page-design-loaded", {
                    design: data,
                    pageDesign: data
                }));
                return data
            }).fail(function() {
                throw new Error("Page design could not be loaded");
            })
        })
    }
    ;
    ns.loadComponents = function() {
        var $pageInfoPromise = ns.getLoaderPromise(0);
        if (!$pageInfoPromise)
            return $.Deferred().reject().promise();
        return $pageInfoPromise.then(function(pageInfo) {
            var pageComponentsProvider = pageInfo.componentsRef || PAGE_COMPONENTS_PROVIDER;
            return $.ajax({
                cache: true,
                dataType: "text",
                type: "GET",
                url: Granite.HTTP.externalize(pageComponentsProvider)
            })
        }).then(function(data) {
            var components = [];
            data = eval("(" + data + ")");
            for (var key in data) {
                if (!data.hasOwnProperty(key))
                    continue;
                var componentConfig = data[key];
                components.push(new ns.Component(componentConfig))
            }
            channel.trigger($.Event("cq-components-loaded", {
                components: components
            }));
            return components
        }).fail(function() {
            throw new Error("Components could not be loaded");
        })
    }
    ;
    var DEFAULT_CONFIG = {
        layerManager: ns.LayerManager,
        layers: [ns.edit.Layer, ns.PreviewLayer],
        tourUrl: "/libs/wcm/core/content/editor/tour/content.html",
        loaders: [ns.loadPageInfo, ns.loadPageDesign, ns.loadComponents, ns.ContentFrame.loadEditablesAsync],
        dropControllers: [ns.ui.ComponentDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop, ns.ui.EditableDragAndDrop],
        toolbarActionOrder: ["EDIT", "CONFIGURE", "STYLE", "COPY", "CUT", "DELETE", "INSERT", "PASTE", "GROUP", "PARENT", "LAYOUT"],
        assetTypeOrder: ["Images", "Videos", "Products", "Documents", "Paragraphs", "Content Fragments", "Experience Fragments", "Pages", "Design Packages", "Adaptive Forms", "Adaptive Documents", "Manuscript", "3D"]
    };
    ns.init = function(config, useApplyDefaults) {
        var i, length = 0;
        validateInitConfig(config);
        if (useApplyDefaults)
            ns.config = Granite.Util.applyDefaults(DEFAULT_CONFIG, config);
        else
            ns.config = $.extend(true, DEFAULT_CONFIG, config);
        ns.preferences = new ns.Preferences(ns.config.name);
        ns.layerManager = new ns.config.layerManager;
        if (ns.config.layers)
            for (i = 0,
            length = ns.config.layers.length; i < length; ++i)
                ns.layerManager.registerLayer(new ns.config.layers[i]);
        ns.actions.changeAuthoringUIMode(ns.actions.AUTHORING_UI_MODE.TOUCH);
        if (ns.config.dropControllers) {
            for (i = 0,
            length = ns.config.dropControllers.length; i < length; ++i) {
                var controller = ns.config.dropControllers[i];
                if (!$.isFunction(controller.prototype.getTypeName))
                    throw new Error("Drop Controller has no type name function",controller);
                ns.ui.dropController.register(controller.prototype.getTypeName(), new controller)
            }
            ns.ui.dropController.enable()
        }
        channel.on("cq-content-frame-loaded", onContentFrameLoaded);
        ns.EditorFrame.init();
        ns.ContentFrame.init();
        ns.history.Manager.setEnabled(true)
    }
}
)(jQuery, Granite.author, jQuery(document));
(function($, ns, channel, window, undefined) {
    ns.keys = ns.keys || {};
    ns.keys.layers = new CUI.Keys(document.documentElement,{
        stopPropagation: true,
        preventDefault: true,
        filter: function() {
            return true
        }
    });
    var keysMapping = {
        "shift+cmd+m.CQ-author-keys-layers": function() {
            ns.layerManager.toggle()
        },
        "shift+ctrl+m.CQ-author-keys-layers": function() {
            ns.layerManager.toggle()
        },
        "shift+cmd+alt+m.CQ-author-keys-layers": function() {
            ns.layerManager.focus()
        },
        "shift+ctrl+alt+m.CQ-author-keys-layers": function() {
            ns.layerManager.focus()
        }
    };
    channel.on("cq-editor-loaded", function() {
        ns.keys.layers.on(keysMapping);
        var keys = new CUI.Keys(channel,{
            stopPropagation: true,
            preventDefault: true,
            filter: function() {
                return true
            }
        });
        keys.on(keysMapping)
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Images";
    function ImageDragAndDrop() {
        this.constructor.super_.constructor.apply(this, arguments)
    }
    ns.util.inherits(ImageDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ImageDragAndDrop.prototype.prepareProperties = function(event, dropTarget) {
        var properties = ImageDragAndDrop.super_.prepareProperties.apply(this, arguments);
        var imgNode = dropTarget.name.substring(0, dropTarget.name.lastIndexOf("/"));
        properties[imgNode + "/jcr:lastModified"] = null;
        properties[imgNode + "/jcr:lastModifiedBy"] = null;
        properties[imgNode + "/fileName"] = null;
        properties[imgNode + "/file@Delete"] = "true";
        return properties
    }
    ;
    ns.ui.dropController.register(name, new ImageDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}
      , name = "Images";
    self.searchRoot = "/content/dam";
    self.viewInAdminRoot = "/assetdetails.html{+item}";
    var searchPath = self.searchRoot
      , imageServlet = "/bin/wcm/contentfinder/asset/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/asset";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": query.concat('order:"-jcr:content/jcr:lastModified" '),
            "mimeType": "image,application/x-ImageSet,application/x-SpinSet,application/x-MixedMediaSet,application/x-CarouselSet",
            "itemResourceType": itemResourceType,
            "limit": lowerLimit + ".." + upperLimit,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(imageServlet) + searchPath,
            data: param
        })
    }
    ;
    self.setServlet = function(imgServlet) {
        imageServlet = imgServlet
    }
    ;
    self.setSearchPath = function(spath) {
        searchPath = spath
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns) {
    var self = {
        searchRoot: "/content",
        viewInAdminRoot: "/assetdetails.html/+item}"
    }
      , name = "Scene7";
    var searchPath = self.searchRoot
      , imageServlet = "/bin/wcm/contentfinder/asset/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/asset";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var index2 = 2;
        var queryObj = {};
        if (query.indexOf('"') !== -1)
            queryObj.searchTerm = query.substring(0, query.indexOf('"')).trim();
        else
            queryObj.searchTerm = query.trim();
        query.split(/\s+/).forEach(function(item) {
            var resArr = /^"(\S+)":"(\S+)"$/.exec(item);
            if (resArr !== null)
                if (queryObj[resArr[1]] === undefined)
                    queryObj[resArr[1]] = resArr[index2];
                else
                    queryObj[resArr[1]] = queryObj[resArr[1]] + "," + resArr[index2]
        });
        var param = {
            _dc: (new Date).getTime()
        };
        if (searchPath === null)
            param.path = "";
        else
            param.path = searchPath;
        if (queryObj.assetType === undefined)
            param.assetType = "Image,Template,Video,MasterVideo,MbrSet";
        else
            param.assetType = queryObj.assetType;
        if (queryObj.searchTerm === undefined)
            param.searchTerm = "";
        else
            param.searchTerm = queryObj.searchTerm;
        if (queryObj["jcr:content/cq:lastReplicationAction"] === undefined)
            param.publishStatus = "";
        else
            param.publishStatus = queryObj["jcr:content/cq:lastReplicationAction"];
        param.limit = lowerLimit + ".." + upperLimit;
        if (queryObj.s7conf !== undefined) {
            var url = queryObj.s7conf + "/jcr:content.search.html";
            return $.ajax({
                type: "GET",
                dataType: "html",
                url: url,
                data: param
            })
        }
    }
    ;
    self.setServlet = function(imgServlet) {
        imageServlet = imgServlet
    }
    ;
    self.setSearchPath = function(spath) {
        searchPath = spath
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author);
(function($, ns, channel, window, undefined) {
    var name = "Image";
    function ImageDragAndDrop() {}
    ns.util.inherits(ImageDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new ImageDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Video";
    function VideoDragAndDrop() {}
    ns.util.inherits(VideoDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new VideoDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "MbrSet";
    function MbrSetDragAndDrop() {}
    ns.util.inherits(MbrSetDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new MbrSetDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Flash";
    function FlashDragAndDrop() {}
    ns.util.inherits(FlashDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new FlashDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Fxg";
    function FxgDragAndDrop() {}
    ns.util.inherits(FxgDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new FxgDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Template";
    function TemplateDragAndDrop() {}
    ns.util.inherits(TemplateDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new TemplateDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}
      , name = "Videos";
    self.searchRoot = "/content/dam";
    self.viewInAdminRoot = "/assetdetails.html{+item}";
    var searchPath = self.searchRoot
      , imageServlet = "/bin/wcm/contentfinder/asset/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/asset";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": query.concat('order:"-jcr:content/jcr:lastModified" '),
            "mimeType": "video,application/x-shockwave-flash,application/vnd.rn-realmedia,application/mxf",
            "itemResourceType": itemResourceType,
            "limit": lowerLimit + ".." + upperLimit,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(imageServlet) + searchPath,
            data: param
        })
    }
    ;
    self.setServlet = function(imgServlet) {
        imageServlet = imgServlet
    }
    ;
    self.setSearchPath = function(spath) {
        searchPath = spath
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}
      , name = "Documents";
    self.searchRoot = "/content/dam";
    self.viewInAdminRoot = "/assetdetails.html{+item}";
    var searchPath = self.searchRoot
      , imageServlet = "/bin/wcm/contentfinder/asset/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/asset";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": query.concat('order:"-jcr:content/jcr:lastModified" '),
            "mimeType": "application/vnd.oasis.opendocument.text,text/rtf,application/rtf,text/html,application/vnd.openxmlformats,application/msword,text/html," + "application/vnd.ms-powerpoint,application/mspowerpoint,application/powerpoint,application/x-mspowerpoint,application/x-msexcel,application/x-excel," + "application/excel,application/vnd.ms-excel,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
            "itemResourceType": itemResourceType,
            "limit": lowerLimit + ".." + upperLimit,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(imageServlet) + searchPath,
            data: param
        })
    }
    ;
    self.setServlet = function(imgServlet) {
        imageServlet = imgServlet
    }
    ;
    self.setSearchPath = function(spath) {
        searchPath = spath
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}
      , name = "Manuscript";
    self.searchRoot = "/content/dam";
    var searchPath = self.searchRoot
      , imageServlet = "/bin/wcm/contentfinder/asset/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/asset";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": query.concat('order:"-jcr:content/jcr:lastModified" '),
            "mimeType": "text",
            "itemResourceType": itemResourceType,
            "limit": lowerLimit + ".." + upperLimit,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(imageServlet) + searchPath,
            data: param
        })
    }
    ;
    self.setServlet = function(imgServlet) {
        imageServlet = imgServlet
    }
    ;
    self.setSearchPath = function(spath) {
        searchPath = spath
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Paragraphs";
    function ParagraphDragAndDrop() {}
    ns.util.inherits(ParagraphDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    ns.ui.dropController.register(name, new ParagraphDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}, name = "Paragraphs", prevRetryText;
    self.searchRoot = "/content";
    var searchPath = self.searchRoot
      , servlet = ".listParagraphs.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/paragraph";
    self.setUp = function() {
        var $retry = ns.ui.assetFinder.$el.find(".emptyresult .retry");
        prevRetryText = $retry.text();
        $retry.text(Granite.I18n.get("Please select a valid page"));
        ns.ui.assetFinder.$el.find("#assetsearch").prop("disabled", true).next("button").prop("disabled", true).closest(".coral-DecoratedTextfield").addClass("is-disabled")
    }
    ;
    self.tearDown = function() {
        var $retry = ns.ui.assetFinder.$el.find(".emptyresult .retry");
        $retry.text(prevRetryText);
        ns.ui.assetFinder.$el.find("#assetsearch").prop("disabled", false).next("button").prop("disabled", false).closest(".coral-DecoratedTextfield").removeClass("is-disabled")
    }
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": query.concat('order:"-jcr:content/jcr:lastModified" '),
            "start": lowerLimit,
            "limit": Math.max(upperLimit - lowerLimit, 0),
            "itemResourceType": itemResourceType,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(searchPath + servlet),
            data: param
        })
    }
    ;
    self.setServlet = function(serv) {
        servlet = serv
    }
    ;
    self.setSearchPath = function(path) {
        searchPath = path.replace(/\/$/, "")
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var name = "Pages";
    function PageDragAndDrop() {}
    ns.util.inherits(PageDragAndDrop, ns.ui.assetFinder.AssetDragAndDrop);
    PageDragAndDrop.prototype.handleDrop = function(event) {
        var editable = event.currentDropTarget.targetEditable, dropTargetId = $(event.target).attr("data-asset-id"), properties = {}, dropTarget, j;
        if (!dropTargetId)
            return;
        dropTarget = editable.getDropTarget(dropTargetId);
        properties[dropTarget.name] = event.path;
        for (j in dropTarget.params)
            if (dropTarget.params.hasOwnProperty(j))
                properties[j] = dropTarget.params[j];
        ns.persistence.readParagraphContent(editable).then(function(data) {
            var originalData = JSON.parse(data);
            originalData["./pages"] = originalData["pages"] ? originalData["pages"] : "";
            ns.edit.EditableActions.UPDATE.execute(editable, properties).then(function() {
                ns.history.util.Utils.addUpdateParagraphStep(editable.path, editable.type, originalData, properties);
                ns.selection.select(editable)
            })
        })
    }
    ;
    ns.ui.dropController.register(name, new PageDragAndDrop)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}
      , name = "Pages";
    self.searchRoot = "/content";
    self.viewInAdminRoot = "/mnt/overlay/wcm/core/content/sites/properties.html?item\x3d{+item}";
    var searchPath = self.searchRoot
      , pageServlet = "/bin/wcm/contentfinder/page/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/page";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": "order:-jcr:content/cq:lastModified " + query,
            "type": "cq:Page",
            "itemResourceType": itemResourceType,
            "limit": lowerLimit + ".." + upperLimit,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(pageServlet) + searchPath,
            data: param
        })
    }
    ;
    self.setServlet = function(servlet) {
        pageServlet = servlet
    }
    ;
    self.setSearchPath = function(path) {
        searchPath = path.replace(/\/$/, "")
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var $tagList = ns.ui.assetFinder.$el.find(".rail-view.active coral-taglist.taglist")
          , $tagFilters = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter.options-predicate");
        var handleFilterRemove = function(event, itemParam) {
            var item = event.originalEvent.detail.item
              , elem = $tagFilters.find(".search-predicate-optionstype-option[value\x3d'" + item.value + "']")
              , propertyPath = elem.closest(".options-predicate").find("input.propertyPath").val();
            if (elem.length > 0) {
                $tagList.off("coral-collection:remove.property");
                if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyPath))
                    ns.ui.assetFinder.TagList._removeTagFilter(item.value, propertyPath);
                elem.attr("checked", false);
                ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                ns.ui.assetFinder.utilsCommons.loadAssets(false);
                $tagList.on("coral-collection:remove.property", handleFilterRemove)
            }
        };
        $tagList.off("coral-collection:remove.property").on("coral-collection:remove.property", handleFilterRemove);
        $tagFilters.on("change", ".search-predicate-optionstype-option", function(event) {
            var filterValue = $(event.target).val()
              , isRadio = $(event.target).prop("nodeName").toLowerCase() === "coral-radio"
              , filterText = $(event.target).find(isRadio ? "coral-radio-label" : "coral-checkbox-label").html()
              , isActive = event.currentTarget.checked
              , propertyPath = $(event.target).closest(".options-predicate").find("input.propertyPath").val();
            $tagList.off("coral-collection:remove.property");
            if (isActive) {
                if (isRadio) {
                    var parentContainer = $(event.target).closest("coral-accordion-item-content");
                    parentContainer.find('input[type\x3d"radio"]:not(:checked)').each(function(index) {
                        if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyPath))
                            ns.ui.assetFinder.TagList._removeTagFilter($(this).val(), propertyPath)
                    })
                }
                ns.ui.assetFinder.TagList._setTagFilter(filterText, filterValue, propertyPath)
            } else if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyPath))
                ns.ui.assetFinder.TagList._removeTagFilter(filterValue, propertyPath);
            $tagList.on("coral-collection:remove", handleFilterRemove);
            ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
            ns.ui.assetFinder.utilsCommons.loadAssets(false)
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var $tagFilters = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter")
          , $tagList = ns.ui.assetFinder.$el.find(".rail-view.active coral-taglist.taglist");
        var handleFilterRemove = function(event) {
            var $tagFilter = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter .range-predicate")
              , item = event.originalEvent.detail.item
              , bounds = item.value.split("..")
              , propertyPath = $tagFilter.find("input.propertyName").val();
            $.each(bounds, function() {
                var boundInputs = $tagFilter.find('input[is\x3d"coral-textfield"]');
                $.each(boundInputs, function(index, element) {
                    var input = $(element);
                    if (input.val() === this.valueOf())
                        input.val("")
                }
                .bind(this))
            });
            if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyPath)) {
                $tagList.off("coral-collection:remove.rangePredicate");
                ns.ui.assetFinder.TagList._removeTagFilter(item.value, propertyPath);
                ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                ns.ui.assetFinder.utilsCommons.loadAssets(false);
                $tagList.on("coral-collection:remove.rangePredicate", handleFilterRemove)
            }
        };
        $tagList.off("coral-collection:remove.rangePredicate").on("coral-collection:remove.rangePredicate", handleFilterRemove);
        $tagFilters.off("keyup").on("keyup", '.range-predicate input[is\x3d"coral-textfield"]', function(event) {
            var $modifiedInput = $(event.target)
              , property = $modifiedInput.parent().siblings(".propertyName").val()
              , isMinRange = $modifiedInput.parent().hasClass("min-range-val")
              , rangeValue = ""
              , rangeValueDisplay = ""
              , $lastPropValue = $("input[type\x3dhidden][name\x3d'" + property + "']", $tagList);
            if (event.keyCode === 13 && !$modifiedInput.hasClass("is-invalid")) {
                var value = $modifiedInput.val();
                if (isMinRange)
                    rangeValue = value + ns.ui.assetFinder.utilsCommons.RANGE_DELIMITER + $modifiedInput.parent().siblings(".max-range-val").find('input[is\x3d"coral-textfield"]').val();
                else
                    rangeValue = $modifiedInput.parent().siblings(".min-range-val").find('input[is\x3d"coral-textfield"]').val() + ns.ui.assetFinder.utilsCommons.RANGE_DELIMITER + value;
                if ($lastPropValue.length > 0) {
                    $tagList.off("coral-collection:remove.rangePredicate").on("coral-collection:remove.rangePredicate", function() {
                        $tagList.off("coral-collection:remove.rangePredicate").on("coral-collection:remove.rangePredicate", handleFilterRemove)
                    });
                    ns.ui.assetFinder.TagList._removeTagFilter($lastPropValue.val(), property)
                }
                if (rangeValue.length !== 0 && rangeValue !== ns.ui.assetFinder.utilsCommons.RANGE_DELIMITER) {
                    rangeValueDisplay = $modifiedInput.closest("coral-accordion.assetfilter").find("coral-accordion-item-label").text() + " " + rangeValue;
                    ns.ui.assetFinder.TagList._setTagFilter(rangeValueDisplay, rangeValue, property)
                }
                ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                ns.ui.assetFinder.utilsCommons.loadAssets(false)
            }
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var $tagFilters = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter")
          , $tagList = ns.ui.assetFinder.$el.find(".rail-view.active coral-taglist.taglist");
        var handleFilterRemove = function() {
            var $tagFilter = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter .slider-predicate");
            var sliders = $tagFilter.find(".slider");
            $.each(sliders, function() {
                var slider = $(this);
                if (slider.length > 0) {
                    var ranges = slider.data("ranges");
                    var coralSlider = slider.data("labeled-slider");
                    coralSlider.setValue(1, 0);
                    coralSlider.setValue(ranges.length, 1);
                    ns.ui.assetFinder.TagList.getValues().then(function(values) {
                        ns.ui.assetFinder.utilsCommons.filters.setVisibilityClearAll(values.length)
                    });
                    ns.ui.assetFinder.utilsCommons.loadAssets(false)
                }
            })
        };
        $tagList.off("coral-collection:remove.sliderPredicate").on("coral-collection:remove.sliderPredicate", handleFilterRemove);
        $tagFilters.on("change", ".slider-predicate input[type\x3drange]", function(event) {
            var rangeValue = ""
              , rangeValueDisplay = ""
              , upperBound = ""
              , lowerBound = ""
              , property = $(this).closest("coral-accordion.assetfilter").find(".propertyName").val()
              , $lastPropValue = $("input[type\x3dhidden][name\x3d'" + property + "']", $tagList);
            $(this).closest(".slider-predicate").find("input[type\x3drange]").each(function() {
                var bound = $(this).data("bound")
                  , isMinRange = bound === "lowerBound"
                  , ranges = $(this).closest(".slider").data("ranges")
                  , value = ranges[parseInt($(this).val()) - 1]
                  , min = parseInt($(this).attr("min"))
                  , max = parseInt($(this).attr("max"));
                if (isMinRange) {
                    if (parseInt($(this).val()) > min)
                        lowerBound = value
                } else if (parseInt($(this).val()) < max)
                    upperBound = value
            });
            if ($lastPropValue.length > 0) {
                $tagList.off("coral-collection:remove.sliderPredicate").on("coral-collection:remove.sliderPredicate", function() {
                    $tagList.off("coral-collection:remove.sliderPredicate").on("coral-collection:remove.sliderPredicate", handleFilterRemove)
                });
                ns.ui.assetFinder.TagList._removeTagFilter($lastPropValue.val(), property)
            }
            if (lowerBound.length !== 0 || upperBound.length !== 0) {
                rangeValue = lowerBound + ns.ui.assetFinder.utilsCommons.RANGE_DELIMITER + upperBound;
                rangeValueDisplay = $(this).closest("coral-accordion.assetfilter").find("coral-accordion-item-label").text() + " " + rangeValue;
                ns.ui.assetFinder.TagList._setTagFilter(rangeValueDisplay, rangeValue, property)
            }
            ns.ui.assetFinder.TagList.getValues().then(function(values) {
                ns.ui.assetFinder.utilsCommons.filters.setVisibilityClearAll(values.length)
            });
            ns.ui.assetFinder.utilsCommons.loadAssets(false)
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var $tagFilters = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter.daterange-predicate")
          , $tagList = ns.ui.assetFinder.$el.find(".rail-view.active coral-taglist.taglist")
          , lowerBound = ""
          , upperBound = ""
          , upperBoundDisplay = ""
          , lowerBoundDisplay = "";
        var handleFilterRemove = function(event) {
            var $tagFilter = ns.ui.assetFinder.$el.find(".rail-view.active coral-accordion.assetfilter.daterange-predicate")
              , item = event.originalEvent.detail.item
              , bounds = item.value.split("..")
              , propertyPath = $tagFilter.find("input.propertyName").val();
            $.each(bounds, function() {
                var boundInputs = $tagFilter.find(" input[type\x3dhidden]");
                $.each(boundInputs, function(index, element) {
                    var input = $(element);
                    if (input.val() === this.valueOf())
                        input.closest("coral-datepicker").val("")
                }
                .bind(this))
            });
            $tagList.off("coral-collection:remove.daterangePredicate");
            ns.ui.assetFinder.TagList._removeTagFilter(item.value, propertyPath);
            ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
            ns.ui.assetFinder.utilsCommons.loadAssets(false);
            $tagList.on("coral-collection:remove.daterangePredicate", handleFilterRemove)
        };
        $tagList.off("coral-collection:remove.daterangePredicate").on("coral-collection:remove.daterangePredicate", handleFilterRemove);
        $tagFilters.on("change", "coral-datepicker", function(event) {
            var $modifiedInput = $(event.target)
              , val = $modifiedInput.val()
              , property = $modifiedInput.closest("coral-accordion-item-content").find("input.propertyName").val()
              , $lastPropValue = $("input[type\x3dhidden][name\x3d'" + property + "']", $tagList);
            if ($(this).filter('[name$\x3d"_daterange.lowerBound"]').length === 1) {
                if (lowerBound === undefined && val.length === 0 || lowerBound !== undefined && val === lowerBound)
                    return;
                lowerBound = val;
                lowerBoundDisplay = val.length === 0 ? "" : moment(val).format("YYYY.MM.DD")
            } else if ($(this).filter('[name$\x3d"_daterange.upperBound"]').length === 1) {
                if (upperBound === undefined && val.length === 0 || upperBound !== undefined && val === upperBound)
                    return;
                upperBound = val;
                upperBoundDisplay = val.length === 0 ? "" : moment(val).format("YYYY.MM.DD")
            }
            if ($lastPropValue.length > 0) {
                $tagList.off("coral-collection:remove.daterangePredicate").on("coral-collection:remove.daterangePredicate", function() {
                    $tagList.off("coral-collection:remove.daterangePredicate").on("coral-collection:remove.daterangePredicate", handleFilterRemove)
                });
                ns.ui.assetFinder.TagList._removeTagFilter($lastPropValue.val(), property)
            }
            if (lowerBound.length > 0 || upperBound.length > 0) {
                var rangeValue = lowerBound + ns.ui.assetFinder.utilsCommons.RANGE_DELIMITER + upperBound
                  , rangeValueDisplay = $modifiedInput.closest("coral-accordion.assetfilter").find("coral-accordion-item-label").text() + " " + lowerBoundDisplay + ns.ui.assetFinder.utilsCommons.RANGE_DELIMITER + upperBoundDisplay;
                ns.ui.assetFinder.TagList._setTagFilter(rangeValueDisplay, rangeValue, property);
                ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                ns.ui.assetFinder.utilsCommons.loadAssets(false)
            }
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var $componentFilters = ns.ui.assetFinder.$el.find(".rail-view.active .components-predicate")
          , $tagList = ns.ui.assetFinder.$el.find(".rail-view.active coral-taglist.taglist");
        var handleFilterRemove = function(event) {
            var item = event.originalEvent.detail.item;
            if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty($(".propertyName", $componentFilters).val())) {
                $tagList.off("coral-collection:remove.componentsPredicate");
                ns.ui.assetFinder.TagList._removeTagFilter(item.value, $(".propertyName", $componentFilters).val());
                $tagList.on("coral-collection:remove.componentsPredicate", handleFilterRemove);
                ns.ui.assetFinder.utilsCommons.loadAssets(false);
                ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction()
            }
        };
        $tagList.off("coral-collection:remove.componentsPredicate").on("coral-collection:remove.componentsPredicate", handleFilterRemove);
        $componentFilters.on("change:value", function(event, payload) {
            var $input = $(".js-coral-Autocomplete-textfield", $(this));
            ns.ui.assetFinder.TagList._setTagFilter($input.val(), payload.value, $(".propertyName", $(this)).val());
            $input.val("");
            ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
            ns.ui.assetFinder.utilsCommons.loadAssets(false)
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var $tagsPredicates = ns.ui.assetFinder.$el.find(".rail-view.active .tags-predicate");
        var $tagList = ns.ui.assetFinder.$el.find(".rail-view.active coral-taglist.taglist");
        var handleFilterRemove = function(event) {
            var item = event.originalEvent.detail.item;
            var propertyName = item.querySelector("input").getAttribute("name");
            if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyName)) {
                $tagList.off("coral-collection:remove.tagsPredicate");
                ns.ui.assetFinder.TagList._removeTagFilter(item.value, propertyName);
                $tagList.on("coral-collection:remove.tagsPredicate", handleFilterRemove);
                ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                ns.ui.assetFinder.utilsCommons.loadAssets(false)
            }
        };
        $tagList.off("coral-collection:remove.tagsPredicate").on("coral-collection:remove.tagsPredicate", handleFilterRemove);
        $tagsPredicates.each(function() {
            var predicate = this;
            var tagField = predicate.querySelector(".cq-ui-tagfield");
            var tagList = tagField.querySelector("coral-taglist");
            Coral.commons.ready(tagList, function() {
                var inputID = predicate.querySelector(".foundation-autocomplete-inputgroupwrapper input[is\x3d'coral-textfield']").getAttribute("id");
                predicate.querySelector(".label-InputGroup").setAttribute("for", inputID);
                tagList.off("coral-collection:add.tagsPredicate").on("coral-collection:add.tagsPredicate", function(event) {
                    var tag = event.detail.item;
                    ns.ui.assetFinder.TagList._setTagFilter(tag.label.innerHTML, tag.value, tagField.name);
                    tagList.clear();
                    ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                    ns.ui.assetFinder.utilsCommons.loadAssets(false)
                })
            })
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var USER_PREDICATE_FIELD_SELECTOR = ".user-predicate";
        var ACTIVE_RAIL_SELECTOR = ".rail-view.active";
        var USER_PREDICATE_SELECTOR = ACTIVE_RAIL_SELECTOR + " " + USER_PREDICATE_FIELD_SELECTOR;
        var SELECTED_FILTER_TAG_LIST_SELECTOR = ".selected-filter-panel \x3e coral-taglist.taglist";
        var USER_PREDICATE_AUTOCOMPLETE_SELECTOR = USER_PREDICATE_SELECTOR + " foundation-autocomplete";
        var USER_PREDICATE_TAG_LIST_SELECTOR = "coral-taglist";
        var USER_PREDICATE_TAG_LABEL_SELECTOR = "coral-tag-label";
        var USER_PREDICATE_EVENT_NAMESPACE = "userPredicate";
        var TAG_ADD_EVENT = "coral-collection:add";
        var TAG_REMOVE_EVENT = "coral-collection:remove";
        var USER_PREDICATE_PROPERTY_NAME_SELECTOR = ".propertyName";
        var $userFiltersAutocomplete = ns.ui.assetFinder.$el.find(USER_PREDICATE_AUTOCOMPLETE_SELECTOR);
        var $selectedFilterTagList = ns.ui.assetFinder.$el.find(ACTIVE_RAIL_SELECTOR + " " + SELECTED_FILTER_TAG_LIST_SELECTOR);
        function getPropertyName(element) {
            var userPredicateField = element.closest(USER_PREDICATE_FIELD_SELECTOR);
            if (!userPredicateField)
                return;
            return userPredicateField.querySelector(USER_PREDICATE_PROPERTY_NAME_SELECTOR)
        }
        var handleFilterRemove = function(event) {
            if ($userFiltersAutocomplete.length === 0)
                return;
            var item = event.originalEvent.detail.item;
            var propertyName = getPropertyName($userFiltersAutocomplete[0]);
            if (!propertyName || !ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyName.value))
                return;
            $selectedFilterTagList.off(TAG_REMOVE_EVENT + "." + USER_PREDICATE_EVENT_NAMESPACE);
            ns.ui.assetFinder.TagList._removeTagFilter(item.value, propertyName.value);
            $selectedFilterTagList.on(TAG_REMOVE_EVENT + "." + USER_PREDICATE_EVENT_NAMESPACE, handleFilterRemove);
            ns.ui.assetFinder.utilsCommons.loadAssets(false);
            ns.ui.assetFinder.TagList.getValues().then(function(values) {
                ns.ui.assetFinder.utilsCommons.filters.setVisibilityClearAll(values.length)
            })
        };
        if ($userFiltersAutocomplete.length > 0) {
            if ($selectedFilterTagList.length > 0)
                $selectedFilterTagList.off(TAG_REMOVE_EVENT + "." + USER_PREDICATE_EVENT_NAMESPACE).on(TAG_REMOVE_EVENT + "." + USER_PREDICATE_EVENT_NAMESPACE, handleFilterRemove);
            $userFiltersAutocomplete.off(TAG_ADD_EVENT + "." + USER_PREDICATE_EVENT_NAMESPACE).on(TAG_ADD_EVENT + "." + USER_PREDICATE_EVENT_NAMESPACE, USER_PREDICATE_TAG_LIST_SELECTOR, function(event) {
                if (!event || !event.detail)
                    return;
                var authorizableTag = event.detail.item;
                var tagLabel = authorizableTag.querySelector(USER_PREDICATE_TAG_LABEL_SELECTOR);
                var propertyName = getPropertyName(this);
                if (!tagLabel || !propertyName)
                    return;
                ns.ui.assetFinder.TagList._setTagFilter(tagLabel.innerText.trim(), authorizableTag.value, propertyName.value);
                ns.ui.assetFinder.TagList.getValues().then(function(values) {
                    ns.ui.assetFinder.utilsCommons.filters.setVisibilityClearAll(values.length)
                });
                ns.ui.assetFinder.utilsCommons.loadAssets(false);
                var tagList = authorizableTag.closest(USER_PREDICATE_TAG_LIST_SELECTOR);
                Coral.commons.ready(tagList, function(element) {
                    element.items.remove(authorizableTag)
                })
            })
        }
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    channel.one("cq-sidepanel-loaded", function() {
        var namspace = ".templatepredicate";
        var selectors = {
            templatePredicate: ".rail-view.active .template-predicate",
            assetFinderTagList: ".rail-view.active coral-taglist.taglist"
        };
        var templatePredicates = document.querySelectorAll(selectors.templatePredicate);
        var assetFinderTagList = ns.ui.assetFinder.$el.find(selectors.assetFinderTagList);
        for (var i = 0; i < templatePredicates.length; i++) {
            var predicate = templatePredicates[i];
            var tagList = predicate.querySelector("foundation-autocomplete coral-taglist");
            var propertyPath = predicate.dataset["propertyPath"];
            Coral.commons.ready(tagList, function(currentTagList) {
                currentTagList.off("coral-collection:add").on("coral-collection:add", function(event) {
                    currentTagList.clear();
                    var tag = event.detail.item;
                    var templatePath = tag.value;
                    var templateTitle = $(tag).text();
                    ns.ui.assetFinder.TagList._setTagFilter(templateTitle, templatePath, propertyPath);
                    ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
                    ns.ui.assetFinder.utilsCommons.loadAssets(false)
                })
            })
        }
        function handleFilterRemove(event) {
            var item = event.originalEvent.detail.item;
            assetFinderTagList.off("coral-collection:remove" + namspace);
            for (var i = 0; i < templatePredicates.length; i++) {
                var predicate = templatePredicates[i];
                var propertyPath = predicate.dataset["propertyPath"];
                if (ns.ui.assetFinder.TagList.getSelectedTags().hasOwnProperty(propertyPath))
                    ns.ui.assetFinder.TagList._removeTagFilter(item.value, propertyPath)
            }
            assetFinderTagList.on("coral-collection:remove" + namspace, handleFilterRemove);
            ns.ui.assetFinder.utilsCommons.filters.handleVisibilityClearAllAction();
            ns.ui.assetFinder.utilsCommons.loadAssets(false)
        }
        Coral.commons.ready(assetFinderTagList[0], function() {
            assetFinderTagList.off("coral-collection:remove" + namspace).on("coral-collection:remove" + namspace, handleFilterRemove)
        })
    })
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window, undefined) {
    var self = {}
      , name = "3D";
    self.searchRoot = "/content/dam";
    var searchPath = self.searchRoot
      , imageServlet = "/bin/wcm/contentfinder/asset/view.html"
      , itemResourceType = "cq/gui/components/authoring/assetfinder/asset";
    self.setUp = function() {}
    ;
    self.tearDown = function() {}
    ;
    self.loadAssets = function(query, lowerLimit, upperLimit) {
        var param = {
            "_dc": (new Date).getTime(),
            "query": query.concat('order:"-jcr:content/jcr:lastModified" '),
            "mimeType": "model/gltf-binary,application/x-tgif,application/vnd.ms-pki.stl",
            "itemResourceType": itemResourceType,
            "limit": lowerLimit + ".." + upperLimit,
            "_charset_": "utf-8"
        };
        return $.ajax({
            type: "GET",
            dataType: "html",
            url: Granite.HTTP.externalize(imageServlet) + searchPath,
            data: param
        })
    }
    ;
    self.setServlet = function(imgServlet) {
        imageServlet = imgServlet
    }
    ;
    self.setSearchPath = function(spath) {
        searchPath = spath
    }
    ;
    self.setItemResourceType = function(rt) {
        itemResourceType = rt
    }
    ;
    self.resetSearchPath = function() {
        searchPath = self.searchRoot
    }
    ;
    ns.ui.assetFinder.register(name, self)
}
)(jQuery, Granite.author, jQuery(document), this);
(function($, ns, channel, window) {
    ns.page = {
        info: {},
        path: "",
        design: {},
        fetchPageInfo: function() {
            return ns.loadPageInfo()
        },
        loadPageInfo: function() {
            return ns.loadPageInfo()
        },
        activateDefaultLayer: function() {
            ns.layerManager.init()
        },
        calculateAllowedComponents: function(design, editable) {
            return ns.components.computeAllowedComponents(editable, design)
        },
        getPageComponents: function(design, editables) {
            var pageComponents = {};
            if (editables)
                $.each(editables, function(index, editable) {
                    var components = ns.components.computeAllowedComponents(editable, design);
                    if (components)
                        $.each(components, function(idx, allowedComponent) {
                            pageComponents[allowedComponent] = true
                        })
                });
            return pageComponents
        }
    };
    ns.edit.createEditable = function(dom) {
        return new ns.Editable(dom)
    }
    ;
    ns.edit.findEditables = ns.ContentFrame.getEditables;
    ns.EditorFrame.actions = ns.actions;
    ns.edit.actions = ns.editableHelper;
    ns.loadEditables = function() {
        ns.ContentFrame.loadEditables()
    }
    ;
    ns.ui.componentBrowser.generateComponents = function(htmlResponse) {
        var components = [];
        var $htmlResponse = $(htmlResponse);
        $.each($htmlResponse, function(i, html) {
            if ($(this).is("article[data-type\x3d'" + ns.Component.prototype.getTypeName() + "']"))
                components.push(new ns.Component(html))
        });
        ns.components.set(components)
    }
    ;
    channel.on("cq-page-info-loaded", function(event) {
        ns.page.info = event.pageInfo;
        ns.page.path = event.pageInfo.status.path
    });
    channel.on("cq-page-design-loaded", function(event) {
        ns.page.design = event.design
    })
}
)(jQuery, Granite.author, jQuery(document), this);
