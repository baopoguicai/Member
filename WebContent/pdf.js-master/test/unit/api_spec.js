/* globals PDFJS, expect, it, describe, Promise, combineUrl, waitsFor,
           InvalidPDFException, MissingPDFException, StreamType, FontType,
           PDFDocumentProxy, PasswordException, PasswordResponses,
           PDFPageProxy, createPromiseCapability */

'use strict';

describe('api', function() {
  var basicApiUrl = combineUrl(window.location.href, '../pdfs/basicapi.pdf');
  var basicApiFileLength = 105779; // bytes
  function waitsForPromiseResolved(promise, successCallback) {
    var resolved = false;
    promise.then(function(val) {
      resolved = true;
      successCallback(val);
    },
    function(error) {
      // Shouldn't get here.
      expect(false).toEqual(true);
    });
    waitsFor(function() {
      return resolved;
    }, 20000);
  }
  function waitsForPromiseRejected(promise, failureCallback) {
    var rejected = false;
    promise.then(function(val) {
      // Shouldn't get here.
      expect(false).toEqual(true);
    },
    function(error) {
      rejected = true;
      failureCallback(error);
    });
    waitsFor(function() {
      return rejected;
    }, 20000);
  }

  describe('PDFJS', function() {
    describe('getDocument', function() {
      it('creates pdf doc from URL', function() {
        var loadingTask = PDFJS.getDocument(basicApiUrl);

        var isProgressReportedResolved = false;
        var progressReportedCapability = createPromiseCapability();

        // Attach the callback that is used to report loading progress;
        // similarly to how viewer.js works.
        loadingTask.onProgress = function (progressData) {
          if (!isProgressReportedResolved) {
            isProgressReportedResolved = true;
            progressReportedCapability.resolve(progressData);
          }
        };

        var promises = [
          progressReportedCapability.promise,
          loadingTask.promise
        ];
        waitsForPromiseResolved(Promise.all(promises), function (data) {
          expect((data[0].loaded / data[0].total) > 0).toEqual(true);
          expect(data[1] instanceof PDFDocumentProxy).toEqual(true);
          expect(loadingTask).toEqual(data[1].loadingTask);
        });
      });
      it('creates pdf doc from URL and aborts before worker initialized',
          function() {
        var loadingTask = PDFJS.getDocument(basicApiUrl);
        loadingTask.destroy();
        waitsForPromiseRejected(loadingTask.promise, function(reason) {
          expect(true).toEqual(true);
        });
      });
      it('creates pdf doc from URL and aborts loading after worker initialized',
          function() {
        var loadingTask = PDFJS.getDocument(basicApiUrl);
        // This can be somewhat random -- we cannot guarantee perfect
        // 'Terminate' message to the worker before/after setting up pdfManager.
        var destroyed = loadingTask._transport.workerInitializedCapability.
          promise.then(function () {
          return loadingTask.destroy();
        });
        waitsForPromiseResolved(destroyed, function (data) {
          expect(true).toEqual(true);
        });
      });
      it('creates pdf doc from typed array', function() {
        var nonBinaryRequest = PDFJS.disableWorker;
        var request = new XMLHttpRequest();
        request.open('GET', basicApiUrl, false);
        if (!nonBinaryRequest) {
          try {
            request.responseType = 'arraybuffer';
            nonBinaryRequest = request.responseType !== 'arraybuffer';
          } catch (e) {
            nonBinaryRequest = true;
          }
        }
        if (nonBinaryRequest && request.overrideMimeType) {
          request.overrideMimeType('text/plain; charset=x-user-defined');
        }
        request.send(null);

        var typedArrayPdf;
        if (nonBinaryRequest) {
          var data = Array.prototype.map.call(request.responseText,
              function (ch) {
            return ch.charCodeAt(0) & 0xFF;
          });
          typedArrayPdf = new Uint8Array(data);
        } else {
          typedArrayPdf = new Uint8Array(request.response);
        }
        // Sanity check to make sure that we fetched the entire PDF file.
        expect(typedArrayPdf.length).toEqual(basicApiFileLength);

        var promise = PDFJS.getDocument(typedArrayPdf);
        waitsForPromiseResolved(promise, function(data) {
          expect(data instanceof PDFDocumentProxy).toEqual(true);
        });
      });
      it('creates pdf doc from invalid PDF file', function() {
        // A severely corrupt PDF file (even Adobe Reader fails to open it).
        var url = combineUrl(window.location.href, '../pdfs/bug1020226.pdf');

        var promise = PDFJS.getDocument(url);
        waitsForPromiseRejected(promise, function (error) {
          expect(error instanceof InvalidPDFException).toEqual(true);
        });
      });
      it('creates pdf doc from non-existent URL', function() {
        var nonExistentUrl = combineUrl(window.location.href,
                                        '../pdfs/non-existent.pdf');
        var promise = PDFJS.getDocument(nonExistentUrl);
        waitsForPromiseRejected(promise, function(error) {
          expect(error instanceof MissingPDFException).toEqual(true);
        });
      });
      it('creates pdf doc from PDF file protected with user and owner password',
         function () {
        var url = combineUrl(window.location.href, '../pdfs/pr6531_1.pdf');
        var loadingTask = PDFJS.getDocument(url);

        var isPasswordNeededResolved = false;
        var passwordNeededCapability = createPromiseCapability();
        var isPasswordIncorrectResolved = false;
        var passwordIncorrectCapability = createPromiseCapability();

        // Attach the callback that is used to request a password;
        // similarly to how viewer.js handles passwords.
        loadingTask.onPassword = function (updatePassword, reason) {
          if (reason === PasswordResponses.NEED_PASSWORD &&
              !isPasswordNeededResolved) {
            isPasswordNeededResolved = true;
            passwordNeededCapability.resolve();

            updatePassword('qwerty'); // Provide an incorrect password.
            return;
          }
          if (reason === PasswordResponses.INCORRECT_PASSWORD &&
              !isPasswordIncorrectResolved) {
            isPasswordIncorrectResolved = true;
            passwordIncorrectCapability.resolve();

            updatePassword('asdfasdf'); // Provide the correct password.
            return;
          }
          // Shouldn't get here.
          expect(false).toEqual(true);
        };

        var promises = [
          passwordNeededCapability.promise,
          passwordIncorrectCapability.promise,
          loadingTask.promise
        ];
        waitsForPromiseResolved(Promise.all(promises), function (data) {
          expect(data[2] instanceof PDFDocumentProxy).toEqual(true);
        });
      });
      it('creates pdf doc from PDF file protected with only a user password',
         function () {
        var url = combineUrl(window.location.href, '../pdfs/pr6531_2.pdf');

        var passwordNeededPromise = PDFJS.getDocument({
          url: url, password: '',
        });
        waitsForPromiseRejected(passwordNeededPromise, function (data) {
          expect(data instanceof PasswordException).toEqual(true);
          expect(data.code).toEqual(PasswordResponses.NEED_PASSWORD);
        });

        var passwordIncorrectPromise = PDFJS.getDocument({
          url: url, password: 'qwerty',
        });
        waitsForPromiseRejected(passwordIncorrectPromise, function (data) {
          expect(data instanceof PasswordException).toEqual(true);
          expect(data.code).toEqual(PasswordResponses.INCORRECT_PASSWORD);
        });

        var passwordAcceptedPromise = PDFJS.getDocument({
          url: url, password: 'asdfasdf',
        });
        waitsForPromiseResolved(passwordAcceptedPromise, function (data) {
          expect(data instanceof PDFDocumentProxy).toEqual(true);
        });
      });
    });
  });
  describe('PDFDocument', function() {
    var promise = PDFJS.getDocument(basicApiUrl);
    var doc;
    waitsForPromiseResolved(promise, function(data) {
      doc = data;
    });
    it('gets number of pages', function() {
      expect(doc.numPages).toEqual(3);
    });
    it('gets fingerprint', function() {
      var fingerprint = doc.fingerprint;
      expect(typeof fingerprint).toEqual('string');
      expect(fingerprint.length > 0).toEqual(true);
    });
    it('gets page', function() {
      var promise = doc.getPage(1);
      waitsForPromiseResolved(promise, function(data) {
        expect(data instanceof PDFPageProxy).toEqual(true);
        expect(data.pageIndex).toEqual(0);
      });
    });
    it('gets non-existent page', function() {
      var promise = doc.getPage(100);
      waitsForPromiseRejected(promise, function(data) {
        expect(data instanceof Error).toEqual(true);
      });
    });
    it('gets page index', function() {
      // reference to second page
      var ref = {num: 17, gen: 0};
      var promise = doc.getPageIndex(ref);
      waitsForPromiseResolved(promise, function(pageIndex) {
        expect(pageIndex).toEqual(1);
      });
    });
    it('gets destinations', function() {
      var promise = doc.getDestinations();
      waitsForPromiseResolved(promise, function(data) {
        expect(data).toEqual({ chapter1: [{ gen: 0, num: 17 }, { name: 'XYZ' },
                                          0, 841.89, null] });
      });
    });
    it('gets a destination', function() {
      var promise = doc.getDestination('chapter1');
      waitsForPromiseResolved(promise, function(data) {
        expect(data).toEqual([{ gen: 0, num: 17 }, { name: 'XYZ' },
                              0, 841.89, null]);
      });
    });
    it('gets a non-existent destination', function() {
      var promise = doc.getDestination('non-existent-named-destination');
      waitsForPromiseResolved(promise, function(data) {
        expect(data).toEqual(null);
      });
    });
    it('gets attachments', function() {
      var promise = doc.getAttachments();
      waitsForPromiseResolved(promise, function (data) {
        expect(data).toEqual(null);
      });
    });
    it('gets javascript', function() {
      var promise = doc.getJavaScript();
      waitsForPromiseResolved(promise, function (data) {
        expect(data).toEqual([]);
      });
    });
    // Keep this in sync with the pattern in viewer.js. The pattern is used to
    // detect whether or not to automatically start printing.
    var viewerPrintRegExp = /\bprint\s*\(/;
    it('gets javascript with printing instructions (Print action)', function() {
      // PDF document with "Print" Named action in OpenAction
      var pdfUrl = combineUrl(window.location.href, '../pdfs/bug1001080.pdf');
      var promise = PDFJS.getDocument(pdfUrl).then(function(doc) {
        return doc.getJavaScript();
      });
      waitsForPromiseResolved(promise, function (data) {
        expect(data).toEqual(['print({});']);
        expect(data[0]).toMatch(viewerPrintRegExp);
      });
    });
    it('gets javascript with printing instructions (JS action)', function() {
      // PDF document with "JavaScript" action in OpenAction
      var pdfUrl = combineUrl(window.location.href, '../pdfs/issue6106.pdf');
      var promise = PDFJS.getDocument(pdfUrl).then(function(doc) {
        return doc.getJavaScript();
      });
      waitsForPromiseResolved(promise, function (data) {
        expect(data).toEqual(
          ['this.print({bUI:true,bSilent:false,bShrinkToFit:true});']);
        expect(data[0]).toMatch(viewerPrintRegExp);
      });
    });
    it('gets outline', function() {
      var promise = doc.getOutline();
      waitsForPromiseResolved(promise, function(outline) {
        // Two top level entries.
        expect(outline.length).toEqual(2);
        // Make sure some basic attributes are set.
        expect(outline[1].title).toEqual('Chapter 1');
        expect(outline[1].items.length).toEqual(1);
        expect(outline[1].items[0].title).toEqual('Paragraph 1.1');
      });
    });
    it('gets metadata', function() {
      var promise = doc.getMetadata();
      waitsForPromiseResolved(promise, function(metadata) {
        expect(metadata.info['Title']).toEqual('Basic API Test');
        expect(metadata.info['PDFFormatVersion']).toEqual('1.7');
        expect(metadata.metadata.get('dc:title')).toEqual('Basic API Test');
      });
    });
    it('gets data', function() {
      var promise = doc.getData();
      waitsForPromiseResolved(promise, function (data) {
        expect(data instanceof Uint8Array).toEqual(true);
        expect(data.length).toEqual(basicApiFileLength);
      });
    });
    it('gets download info', function() {
      var promise = doc.getDownloadInfo();
      waitsForPromiseResolved(promise, function (data) {
        expect(data).toEqual({ length: basicApiFileLength });
      });
    });
    it('gets stats', function() {
      var promise = doc.getStats();
      waitsForPromiseResolved(promise, function (stats) {
        expect(stats).toEqual({ streamTypes: [], fontTypes: [] });
      });
    });

    it('checks that fingerprints are unique', function() {
      var url1 = combineUrl(window.location.href, '../pdfs/issue4436r.pdf');
      var loadingTask1 = PDFJS.getDocument(url1);

      var url2 = combineUrl(window.location.href, '../pdfs/issue4575.pdf');
      var loadingTask2 = PDFJS.getDocument(url2);

      var promises = [loadingTask1.promise,
                      loadingTask2.promise];
      waitsForPromiseResolved(Promise.all(promises), function (data) {
        var fingerprint1 = data[0].fingerprint;
        expect(typeof fingerprint1).toEqual('string');
        expect(fingerprint1.length > 0).toEqual(true);

        var fingerprint2 = data[1].fingerprint;
        expect(typeof fingerprint2).toEqual('string');
        expect(fingerprint2.length > 0).toEqual(true);

        expect(fingerprint1).not.toEqual(fingerprint2);
      });
    });
  });
  describe('Page', function() {
    var resolvePromise;
    var promise = new Promise(function (resolve) {
      resolvePromise = resolve;
    });
    var pdfDocument;
    PDFJS.getDocument(basicApiUrl).then(function(doc) {
      doc.getPage(1).then(function(data) {
        resolvePromise(data);
      });
      pdfDocument = doc;
    });
    var page;
    waitsForPromiseResolved(promise, function(data) {
      page = data;
    });
    it('gets page number', function () {
      expect(page.pageNumber).toEqual(1);
    });
    it('gets rotate', function () {
      expect(page.rotate).toEqual(0);
    });
    it('gets ref', function () {
      expect(page.ref).toEqual({ num: 15, gen: 0 });
    });
    it('gets view', function () {
      expect(page.view).toEqual([0, 0, 595.28, 841.89]);
    });
    it('gets viewport', function () {
      var viewport = page.getViewport(1.5, 90);
      expect(viewport.viewBox).toEqual(page.view);
      expect(viewport.scale).toEqual(1.5);
      expect(viewport.rotation).toEqual(90);
      expect(viewport.transform).toEqual([0, 1.5, 1.5, 0, 0, 0]);
      expect(viewport.width).toEqual(1262.835);
      expect(viewport.height).toEqual(892.92);
    });
    it('gets annotations', function () {
      var promise = page.getAnnotations();
      waitsForPromiseResolved(promise, function (data) {
        expect(data.length).toEqual(4);
      });
    });
    it('gets text content', function () {
      var promise = page.getTextContent();
      waitsForPromiseResolved(promise, function (data) {
        expect(!!data.items).toEqual(true);
        expect(data.items.length).toEqual(7);
        expect(!!data.styles).toEqual(true);
      });
    });
    it('gets operator list', function() {
      var promise = page.getOperatorList();
      waitsForPromiseResolved(promise, function (oplist) {
        expect(!!oplist.fnArray).toEqual(true);
        expect(!!oplist.argsArray).toEqual(true);
        expect(oplist.lastChunk).toEqual(true);
      });
    });
    it('gets stats after parsing page', function () {
      var promise = page.getOperatorList().then(function () {
        return pdfDocument.getStats();
      });
      var expectedStreamTypes = [];
      expectedStreamTypes[StreamType.FLATE] = true;
      var expectedFontTypes = [];
      expectedFontTypes[FontType.TYPE1] = true;
      expectedFontTypes[FontType.CIDFONTTYPE2] = true;

      waitsForPromiseResolved(promise, function (stats) {
        expect(stats).toEqual({ streamTypes: expectedStreamTypes,
                                fontTypes: expectedFontTypes });
      });
    });
  });
});
