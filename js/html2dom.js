(function(DOMParser) {
  /*
   * DOMParser HTML extension
   * 2012-09-04
   *
   * By Eli Grey, http://eligrey.com
   * Public domain.
   * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
   */
  /*! @source https://gist.github.com/1129031 */
  /*global document, DOMParser*/
  "use strict";

  var
    DOMParser_proto = DOMParser.prototype,
    real_parseFromString = DOMParser_proto.parseFromString;

  // Firefox/Opera/IE throw errors on unsupported types
  try {
    // WebKit returns null on unsupported types
    if ((new DOMParser).parseFromString("", "text/html")) {
      // text/html parsing is natively supported
      return;
    }
  } catch (ex) {}

  DOMParser_proto.parseFromString = function(markup, type) {
    if (/^\s*text\/html\s*(?:;|$)/i.test(type)) {
      var
        doc = document.implementation.createHTMLDocument("")
        ;
      if (markup.toLowerCase().indexOf('<!doctype') > -1) {
        doc.documentElement.innerHTML = markup;
      }
      else {
        doc.body.innerHTML = markup;
      }
      return doc;
    } else {
      return real_parseFromString.apply(this, arguments);
    }
  };
}(DOMParser));
var html2dom = (function() {
  /*
   * There is no guarantee as to what might happen if the things supplied to html2dom are not valid html.
   * It's also fairly certain that your html will be mutated. Attributes might shift positions and attribute
   values without quotation mark will probably get quotes. Single quotes might be turned into double quotes.
   */
  var cnt = 0;
  var ids = {};
  var src = ""
  return { parse: parse, html2dom: parse, strToSrc: strToSrc, dom2html: dom2html };

  function dom2html(js, callback, errback) {
    // takes JS source and executes it to get HTML from it.

    var _iframe = document.getElementById('iframe');
    if (_iframe == null) { errback('This function requires this iframe attribute in the DOM: iframe id="iframe" src="data:text/html;charset=utf-8,<div id=\'container\'></div>" sandbox="allow-same-origin"></iframe>'); }
    // _iframe.sandbox = "allow-same-origin";
    // _iframe.src = "data:text/html;charset=utf-8,<div id='container'></div>";

    _iframe.onload = function() {
      this.contentWindow.eval(js);// magic :D
      this.contentWindow.container.appendChild(this.contentWindow.docFragment);
      // ^--- once we do this, there might not be a body element anymore :S
      if (typeof callback == "function") {
        callback(this.contentWindow.container.innerHTML);
      }
    };
    _iframe.onerror = function(err) {
      if (typeof errback == "function") {
        errback(err);
      }
    }
    // _iframe.contentWindow.location.reload();
    _iframe.src = "data:text/html;charset=utf-8,<div id='container'></div>";
  }

  function parse(htmlsource) {
    if (typeof DOMParser == "function") {
      // a bit more heavy-weight and Firefox only (this is OK for b2g things ;))
      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlsource, "text/html");
    }
    else {
      throw Error("Your JS environment doesn't come with either of the supported parsers (document.createDocumentFragment or DOMParser)");
    }
    // reset state..
    src = "";
    ids = {};
    cnt = 0;

    //TODO work around the body thing...
    walkNodes(doc.body); // using body because domparser always creates html, head, body
    return src;
  }

  function mkId(node) {
    var name = node.nodeName.replace(/[^a-zA-Z0-9]/g,"");
    if ((node.nodeType == Node.ELEMENT_NODE) && (node.hasAttribute("id"))) {
      var name = node.id.replace(/[^a-zA-Z0-9]/g,"");
    }
    name = name.toLowerCase(); //XXX use appropriate CamelCase or whatever coding guidelines say      cnt++;
    //TODO: replace h2d_nodeID attribute with a WeakMap, once browser support it.
    Object.defineProperty(node, "h2d_nodeID", {configurable:true, writable:true}) // this looks like an awful hack. in fact...it is! :/
    if (name in ids) {
      var i = ids[name].length -1;
      ids[name].push(name +'_'+i);
      node.h2d_nodeID = name +'_'+i;
    }
    else {
      ids[name] = [name];
      node.h2d_nodeID = name;
    }
  }
  function encodeForWAT(s) {
    return s.replace(/[<>&'"\/]/gi,function(c){return'\\x'+c.charCodeAt(0).toString(16)});
  }
  function encodeForAttribute(s) {
    return s.replace(/[<>&'"\/]/gi, function(c) {return '&#x'+c.charCodeAt(0).toString(16)+';' });
  }
  function strToSrc(s) {
    /* If the browser has JSON support, we can just JSON.stringify() to get a properly quoted string back.
     * If not: String.toSource() gives us (new String("foobar")), this is a bit ugly.
     * the upside is, that it does string escaping for us.
     * so we use String.toSource() and regex-search for the inner part.
     */
    var newSrc;
    if (typeof JSON != "undefined") {
      newSrc = JSON.stringify(s); // this works quite great on strings :)
    }
    else {
      newSrc = ( s.toSource() ).match(/\(new String\((.+)\)\)/)[1];
    }
    // replace masked Identifiers:
    // e.g., "I want $$candy$$" --> "I want "+ candy
    newSrc = newSrc.replace(/\$\$([^"$]+)\$\$/g, '"+ $1 +"');
    return newSrc
  }
  function newElement(node, el_name) {
    if (!("h2d_nodeID" in node)) { mkId(node); }
    if (el_name == "SCRIPT") { //XXX use a more generic way than this hard coded blacklist
      src += "//XXX CSP will forbid inline JavaScript!\n";
    }
    src += ("\nvar " + node.h2d_nodeID + " = document.createElement('" + el_name +"');\n");
  }
  function newAttribute(node, attr, val) {
    //XXX TODO: use el.id = .. instead of el.setAttribute("id", ..) for those attributes that allow it.
    if (attr.indexOf("on") == 0) { //XXX use a more generic way than this hard coded blacklist
      src += "//XXX CSP will forbid inline JavaScript and event handlers. Use addEventHandler instead!\n";
    }
    if (attr == "style") { //XXX use a more generic way than this hard coded blacklist
      src += "//XXX CSP will forbid inline styles. Use ``"+ node.h2d_nodeID + ".style'' instead of setAttribute.\n";
    }
    val = encodeForAttribute(val);
    src += ( node.h2d_nodeID + ".setAttribute(" + strToSrc(attr) + ", "+ strToSrc(val) +");\n");
  }
  function newText(node, text) {
    if (!("h2d_nodeID" in node)) { mkId(node); }
    src += ("var "+node.h2d_nodeID + " = document.createTextNode(" +  strToSrc(text) +");\n");
  }
  function newComment(node, cmt) {
    if (!("h2d_nodeID" in node)) { mkId(node); }
    src += ("var "+node.h2d_nodeID +" = document.createComment(" +  strToSrc(cmt) +");\n");
  }
  function appendToParent(par, node) {
    src += (par+".appendChild("+ node.h2d_nodeID +");\n");
  }

  function walkNodes(root) {
    var iter = document.createNodeIterator(root, NodeFilter.SHOW_ALL, null, false);
    var node;
    while (node = iter.nextNode()) {
      var nodeDescr = node +', name: '+ node.nodeName + ', type: ' + node.nodeType;
      if (node.nodeValue != null) {
        nodeDescr += ', value:' + strToSrc(node.nodeValue);
      }
      if (node == root) {
        if (src.indexOf("docFragment") != 0) {
          src += "var docFragment = document.createDocumentFragment(); // contains all gathered nodes\n";
          // set fixed id (hackish..)...
          Object.defineProperty(node, "h2d_nodeID", {configurable:true, writable:true})
          node.h2d_nodeID = "docFragment";
          continue; // don't add root element (body)
        }
      }
      else {
        var parentName = node.parentNode.h2d_nodeID;
      }
      if (node.nodeType == Node.ELEMENT_NODE) { // ELEMENT_NODE == 1
        newElement(node, node.nodeName);
        // let's replace attributes
        for (var j=0;j<node.attributes.length;j++) {
          var a = node.attributes[j].name;
          var v = node.attributes[j].value;
          newAttribute(node, a, v)
        }
        if (parentName != undefined) { appendToParent(parentName, node); }
      }
      else if (node.nodeType == Node.TEXT_NODE) {
        // skips whitespace-only text nodes:
        if (/\S/.test(node.textContent)) {
          /* remove duplicate whitespaces..
           * XXX this is wrong for pre-tags and tags with style
           * white-space: pre, pre-wrap or pre-line
           * see http://stackoverflow.com/questions/15361012/extract-whitespace-collapsed-text-from-html-as-it-would-be-rendered
           */
          var cleaned = node.textContent.replace(/\s+/,' ')
          newText(node, cleaned);
          if (parentName != undefined) { appendToParent(parentName, node); }
        }
      }
      else if (node.nodeType == Node.COMMENT_NODE){ // 3
        newComment(node, node.nodeValue);
        if (parentName != undefined) { appendToParent(parentName, node); }
      }
      else {
        console.log("Unknown Node Type: " + nodeDescr );
      }
    }
  }
})();
