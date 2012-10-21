/*! Gsloader - v0.0.1 - 2012-10-20
* https://github.com/vkadam/gsloader
* Copyright (c) 2012 Vishal Kadam; Licensed MIT */
;
/**********************************/
(function(_attachTo, $) {
    /*
     * String.format method
     */
    "use strict";
    if (!String.prototype.format) {
        String.prototype.format = function() {
            var str = this.toString();
            for (var i = 0; i < arguments.length; i++) {
                var reg = new RegExp("\\{" + i + "\\}", "gm");
                str = str.replace(reg, arguments[i]);
            }
            return str;
        };
    }

    if (!String.prototype.encodeXML) {
        String.prototype.encodeXML = function() {
            return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\n/g, '&#10;');
        };
    }

    /*
     * Logger class
     */
    var Logger = function(options) {
            $.extend(this, {
                debug: false
            }, options);
        };
    Logger.prototype = {
        log: function() {
            if (this.debug && typeof console !== "undefined" && typeof console.log !== "undefined") {
                console.log.apply(console, arguments);
            }
        }
    };

    /*
     * GSLoader class
     */
    var GSLoaderClass = function(options) {
            Logger.call(this, options);
        };


    GSLoaderClass.prototype = new Logger();

    var GSLoader = new GSLoaderClass();

    function sanitizeOptions(options, attribName) {
        var opts;
        if (typeof(options) === "string") {
            opts = {};
            opts[attribName] = options;
        }
        return opts || options;
    }

    GSLoaderClass.prototype.loadSpreadsheet = function(options) {
        var lsRequest = {},
            deferred = $.Deferred();
        options = $.extend({
            context: lsRequest
        }, sanitizeOptions(options, "id"));
        var spreadSheet = new Spreadsheet({
            id: options.id,
            wanted: options.wanted
        });

        deferred.promise(lsRequest);

        spreadSheet.fetch().done(function() {
            deferred.resolveWith(options.context, [spreadSheet]);
        });

        return lsRequest;
    };

    GSLoaderClass.prototype.enableLog = function() {
        this.debug = true;
        return this;
    };

    GSLoaderClass.prototype.disableLog = function() {
        this.debug = false;
        return this;
    };

    /*
     * Needs GSLoader.drive api
     */
    GSLoaderClass.prototype.createSpreadsheet = function(options) {
        var _this = this;
        var csRequest = {},
            _options = $.extend({
                title: "",
                context: csRequest
            }, sanitizeOptions(options, "title")),
            deferred = $.Deferred();

        function spreadSheetCreated(spreadSheetObj) {
            var spreadSheet = new Spreadsheet({
                id: spreadSheetObj.id,
                title: spreadSheetObj.title
            });
            spreadSheet.fetch().done(function() {
                deferred.resolveWith(_options.context, [spreadSheet]);
            });
        }

        this.drive.createSpreadsheet({
            title: _options.title
        }).done(spreadSheetCreated);

        deferred.promise(csRequest);
        return csRequest;
    };

    /*
     * Spreadsheet class
     */
    var Spreadsheet = function(options) {
            options = sanitizeOptions(options, "id");
            if (options && /id=/.test(options.id)) {
                GSLoader.log("You passed a id as a URL! Attempting to parse.");
                options.id = options.id.match("id=([^&]*)")[1];
            }
            $.extend(this, {
                id: "",
                title: ""
            }, options, {
                sheetsToLoad: [],
                worksheets: []
            });
        };

    Spreadsheet.PRIVATE_SHEET_URL = "https://spreadsheets.google.com/feeds/worksheets/{0}/private/full";
    Spreadsheet.WORKSHEET_ID_REGEX = /.{3}$/;
    Spreadsheet.WORKSHEET_CREATE_REQ = '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:gs="http://schemas.google.com/spreadsheets/2006"><title>{0}</title><gs:rowCount>{1}</gs:rowCount><gs:colCount>{2}</gs:colCount></entry>';

    Spreadsheet.prototype = {

        fetch: function() {
            var _this = this,
                deferred = $.Deferred(),
                fetchReq = {};

            deferred.promise(fetchReq);

            $.ajax({
                url: Spreadsheet.PRIVATE_SHEET_URL.format(this.id)
            }).done(function(data, textStatus, jqXHR) {
                _this.parse(data, textStatus, jqXHR);
                var worksheetReqs = _this.fetchSheets();
                if (worksheetReqs.length > 0) {
                    $.when.apply($, worksheetReqs).done(function() {
                        deferred.resolveWith(fetchReq, [_this]);
                    });
                } else {
                    deferred.resolveWith(fetchReq, [_this]);
                }
            });
            return fetchReq;
        },

        isWanted: function(sheetName) {
            return (this.wanted === "*" || (this.wanted instanceof Array && this.wanted.indexOf(sheetName) !== -1));
        },

        parse: function(data, textStatus, jqXHR) {
            var _this = this;
            var $feed = $(data).children("feed");
            _this.title = $feed.children("title").text();
            var worksheet;
            var title;
            _this.worksheets = [];
            $feed.children("entry").each(function(idx, obj) {
                worksheet = _this.parseWorksheet(this);
                _this.worksheets.push(worksheet);
                if (_this.isWanted(worksheet.title)) {
                    _this.sheetsToLoad.push(worksheet);
                }
            });
        },

        parseWorksheet: function(worksheetInfo) {
            var $worksheet = $(worksheetInfo);
            var title = $worksheet.children("title").text();
            var worksheet = new Worksheet({
                id: $worksheet.children("id").text().match(Spreadsheet.WORKSHEET_ID_REGEX)[0],
                title: title,
                listFeed: $worksheet.children("link[rel*='#listfeed']").attr("href"),
                cellsFeed: $worksheet.children("link[rel*='#cellsfeed']").attr("href"),
                spreadsheet: this
            });
            return worksheet;
        },

        fetchSheets: function() {
            var fetchReqs = [];
            $.each(this.sheetsToLoad, function(idx, worksheet) {
                fetchReqs.push(worksheet.fetch());
            });
            return fetchReqs;
        },

        createWorksheet: function(options) {
            var _this = this,
                deferred = $.Deferred(),
                cwsReq = {};

            deferred.promise(cwsReq);

            options = $.extend({
                title: "",
                rows: 20,
                cols: 20,
                context: cwsReq,
                // callbackContext: callbackContext || _this,
                headers: [],
                rowData: []
            }, sanitizeOptions(options, "title"));

            GSLoader.log("Creating worksheet for spreadsheet", this, "with options =", options);

            var worksheet;
            $.ajax({
                url: Spreadsheet.PRIVATE_SHEET_URL.format(this.id),
                type: "POST",
                contentType: "application/atom+xml",
                headers: {
                    "GData-Version": "3.0"
                },
                data: Spreadsheet.WORKSHEET_CREATE_REQ.format(options.title, options.rows, options.cols)
            }).done(function(data, textStatus, jqXHR) {
                var entryNode = $(jqXHR.responseText).filter(function() {
                    return this.nodeName === "ENTRY";
                });
                // Right now creating worksheet don't return the list feed url, so cretating it using cells feed 
                worksheet = _this.parseWorksheet(entryNode);
                _this.worksheets.push(worksheet);
                worksheet.listFeed = worksheet.cellsFeed.replace("/cells/", "/list/");
                if (options.headers.length > 0 || options.rowData.length > 0) {
                    var rowData = options.rowData;
                    rowData.unshift(options.headers);
                    worksheet.addRows(rowData).done(function() {
                        GSLoader.log("Rows added to worksheet.", worksheet, "Fetching latest data for worksheet");
                        worksheet.fetch().done(function() {
                            deferred.resolveWith(options.context, [worksheet]);
                        });
                    });
                } else {
                    deferred.resolveWith(options.context, [worksheet]);
                }
            });
            return cwsReq;
        }
    };

    /*
     * Worksheet class
     */

    var Worksheet = function(options) {
            $.extend(this, {
                id: "",
                title: "",
                listFeed: "",
                cellsFeed: "",
                rows: [],
                spreadsheet: null
                //successCallbacks: []
            }, options);
        };

    Worksheet.COLUMN_NAME_REGEX = /gsx:/;
    Worksheet.CELL_FEED_HEADER = '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:batch="http://schemas.google.com/gdata/batch" xmlns:gs="http://schemas.google.com/spreadsheets/2006"><id>{0}</id>{1}</feed>';
    Worksheet.CELL_FEED_ENTRY = '<entry><batch:id>R{1}C{2}</batch:id><batch:operation type="update"/><id>{0}/R{1}C{2}</id><gs:cell row="{1}" col="{2}" inputValue="{3}"/></entry>';

    Worksheet.prototype = {
        fetch: function() {
            var _this = this,
                deferred = $.Deferred(),
                fetchReq = {};
            deferred.promise(fetchReq);
            $.ajax({
                url: this.listFeed
            }).done(function() {
                _this.parse.apply(_this, arguments);
                deferred.resolveWith(fetchReq, [_this]);
            });
            return fetchReq;
        },

        parse: function(data, textStatus, jqXHR) {
            var _this = this;
            var $entries = $(data).children("feed").children("entry");
            if ($entries.length === 0) {
                GSLoader.log("Missing data for " + _this.title + ", make sure you didn't forget column headers");
                _this.rows = [];
                return;
            }
            _this.rows = [];
            var row;
            $entries.each(function(idx, obj) {
                row = {
                    "rowNumber": (idx + 1)
                };
                $(this).children().each(function(idx, cell) {
                    if (Worksheet.COLUMN_NAME_REGEX.test(this.tagName)) {
                        row[this.tagName.replace(Worksheet.COLUMN_NAME_REGEX, "")] = this.textContent;
                    }
                });
                _this.rows.push(row);
            });
            GSLoader.log("Total rows in worksheet '" + this.title + "' = " + _this.rows.length);
        },

        addRows: function(rowData) {
            var _this = this,
                entries = [],
                rowNo, colNo, cellValue, deferred = $.Deferred(),
                arReq = {};

            deferred.promise(arReq);

            $.each(rowData, function(rowIdx, rowObj) {
                rowNo = rowIdx + 1;
                $.each(rowObj, function(colIdx, colObj) {
                    colNo = colIdx + 1;
                    if (colObj !== null && typeof colObj !== "undefined") {
                        cellValue = typeof colObj === "string" ? colObj.encodeXML() : colObj;
                        entries.push(Worksheet.CELL_FEED_ENTRY.format(_this.cellsFeed, rowNo, colNo, cellValue));
                    }
                });
            });
            var postData = Worksheet.CELL_FEED_HEADER.format(_this.cellsFeed, entries.join(""));
            $.ajax({
                url: this.cellsFeed + "/batch",
                type: "POST",
                contentType: "application/atom+xml",
                headers: {
                    "GData-Version": "3.0",
                    "If-Match": "*"
                },
                data: postData
            }).done(function(data, textStatus, jqXHR) {
                deferred.resolveWith(arReq, [data, textStatus, jqXHR]);
            });
            return arReq;
        }
    };

    $.extend(_attachTo, {
        GSLoader: GSLoader
    });

}(window, jQuery));;
/**********************************/
/*global GSLoader:false, gapi:false*/
(function(_attachTo, $) {

    "use strict";
    var GSDriveClass = function() {};

    GSDriveClass.prototype = {

        load: function() {
            gapi.client.load("drive", "v2", this.onLoad);
            return this;
        },

        onLoad: function() {
            _attachTo.auth.checkAuth();
            return this;
        },

        createSpreadsheet: function(options) {
            var csRequest = {},
                _options = $.extend({
                    title: "",
                    context: csRequest
                }, options),
                deferred = $.Deferred();

            var request = gapi.client.request({
                "path": "/drive/v2/files",
                "method": "POST",
                "body": {
                    "title": _options.title,
                    "mimeType": "application/vnd.google-apps.spreadsheet"
                }
            });

            deferred.promise(csRequest);
            
            request.execute(function(resp) {
                deferred.resolveWith(_options.context, [resp]);
            });
            return csRequest;
        }/*,

        getFiles: function(callback) {
            var retrievePageOfFiles = function(request, result) {
                    request.execute(function(resp) {
                        result = result.concat(resp.items);
                        var nextPageToken = resp.nextPageToken;
                        if (nextPageToken) {
                            request = gapi.client.drive.files.list({
                                "pageToken": nextPageToken
                            });
                            retrievePageOfFiles(request, result);
                        } else {
                            if (callback) {
                                callback.apply(callback, result);
                            }
                            return result;
                        }
                    });
                };
            var initialRequest = gapi.client.drive.files.list();
            retrievePageOfFiles(initialRequest, []);
            return this;
        }*/
    };

    $.extend(_attachTo, {
        drive: new GSDriveClass()
    });

}(GSLoader, jQuery));;
/**********************************/
/*global GSLoader:false, gapi:false*/
(function(_attachTo, $) {
    "use strict";
    var GSAuthClass = function() {
            this.CLIENT_ID = null;
            this.SCOPES = ["https://www.googleapis.com/auth/drive", "https://spreadsheets.google.com/feeds"].join(" ");
        };

    GSAuthClass.prototype = {

        setClientId: function(clientId) {
            this.CLIENT_ID = clientId;
            return this;
        },

        onLoad: function(callback, context) {
            this.checkAuth();
            if (callback) {
                callback.apply(context, this);
            }
            return this;
        },

        checkAuth: function() {
            gapi.auth.authorize({
                'client_id': this.CLIENT_ID,
                'scope': this.SCOPES,
                'immediate': true
            }, this.handleAuthResult);
            return this;
        },

        handleAuthResult: function(authResult) {
            var _this = this; /* No idea but somewhere context is changed to window object so setting it back to auth object */
            if (!(_this instanceof GSAuthClass)) {
                _this = _attachTo.auth;
            }
            if (authResult && !authResult.error) {
                _attachTo.log("Google Api Authentication Succeed");
            } else {
                _attachTo.log("Authenticating Google Api");
                gapi.auth.authorize({
                    'client_id': _this.CLIENT_ID,
                    'scope': _this.SCOPES,
                    'immediate': false
                }, _this.handleAuthResult);
            }
            return _this;
        }
    };

    $.extend(_attachTo, {
        auth: new GSAuthClass()
    });

}(GSLoader, jQuery));