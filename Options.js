/*
 license: The MIT License, Copyright (c) 2016-2017 YUKI "Piro" Hiroshi
 original:
   http://github.com/piroor/webextensions-lib-options
*/

function Options(aConfigs) {
  this.configs = aConfigs;
  this.uiNodes = {};

  this.onReady = this.onReady.bind(this);
  this.onConfigChanged = this.onConfigChanged.bind(this)
  document.addEventListener('DOMContentLoaded', this.onReady);
}
Options.prototype = {
  configs : null,

  UI_TYPE_UNKNOWN    : 0,
  UI_TYPE_TEXT_FIELD : 1 << 0,
  UI_TYPE_CHECKBOX   : 1 << 1,
  UI_TYPE_RADIO      : 1 << 2,
  UI_TYPE_SELECTBOX  : 1 << 3,

  findUIForKey : function(aKey)
  {
    return document.querySelector([
      '[name="' + aKey + '"]',
      '#' + aKey
    ].join(','));
  },

  detectUIType : function(aNode)
  {
    if (!aNode)
      return this.UI_MISSING;

    if (aNode.localName == 'textarea')
      return this.UI_TYPE_TEXT_FIELD;

    if (aNode.localName == 'select')
      return this.UI_TYPE_SELECTBOX;

    if (aNode.localName != 'input')
      return this.UI_TYPE_UNKNOWN;

    switch (aNode.type)
    {
      case 'text':
      case 'password':
      case 'number':
        return this.UI_TYPE_TEXT_FIELD;

      case 'checkbox':
        return this.UI_TYPE_CHECKBOX;

      case 'radio':
        return this.UI_TYPE_RADIO;

      default:
        return this.UI_TYPE_UNKNOWN;
    }
  },

  throttleTimers : {},
  throttledUpdate : function(aKey, aValue) {
    if (this.throttleTimers[aKey])
      clearTimeout(this.throttleTimers[aKey]);
    this.throttleTimers[aKey] = setTimeout((function() {
      delete this.throttleTimers[aKey];
      switch (typeof this.configs.$default[aKey]) {
        case 'string':
          aValue = String(aValue);
          break;
        case 'number':
          aValue = Number(aValue);
          break;
        case 'boolean':
          if (typeof aValue == 'string')
            aValue = aValue != 'false';
          else
            aValue = Boolean(aValue);
          break;
        default:
          break;
      }
      this.configs[aKey] = aValue;
    }).bind(this), 250);
  },

  bindToCheckbox : function(aKey, aNode)
  {
    aNode.checked = this.configs[aKey];
    aNode.addEventListener('change', (function() {
      this.throttledUpdate(aKey, aNode.checked);
    }).bind(this));
    aNode.disabled = aKey in this.configs.$locked;
    this.addResetMethod(aKey, aNode);
    this.uiNodes[aKey] = this.uiNodes[aKey] || [];
    this.uiNodes[aKey].push(aNode);
  },
  bindToRadio : function(aKey)
  {
    var radios = document.querySelectorAll('input[name="' + aKey + '"]');
    var activated = false;
    Array.slice(radios).forEach((function(aRadio) {
      aRadio.addEventListener('change', (function() {
        if (!activated)
          return;
        var stringifiedValue = this.configs[aKey];
        if (stringifiedValue != aRadio.value)
          this.throttledUpdate(aKey, aRadio.value);
      }).bind(this));
      aRadio.disabled = aKey in this.configs.$locked;
      var key = aKey + '-' + aRadio.value;
      this.uiNodes[key] = this.uiNodes[key] || [];
      this.uiNodes[key].push(aRadio);
    }).bind(this));
    var chosen = this.uiNodes[aKey + '-' + this.configs[aKey]][0];
    if (chosen)
      chosen.checked = true;
    setTimeout(function() {
      activated = true;
    }, 0);
  },
  bindToTextField : function(aKey, aNode)
  {
    aNode.value = this.configs[aKey];
    aNode.addEventListener('input', (function() {
      this.throttledUpdate(aKey, aNode.value);
    }).bind(this));
    aNode.disabled = aKey in this.configs.$locked;
    this.addResetMethod(aKey, aNode);
    this.uiNodes[aKey] = this.uiNodes[aKey] || [];
    this.uiNodes[aKey].push(aNode);
  },
  bindToSelectBox : function(aKey, aNode)
  {
    aNode.value = this.configs[aKey];
    aNode.addEventListener('change', (function() {
      this.throttledUpdate(aKey, aNode.value);
    }).bind(this));
    aNode.disabled = aKey in this.configs.$locked;
    this.addResetMethod(aKey, aNode);
    this.uiNodes[aKey] = this.uiNodes[aKey] || [];
    this.uiNodes[aKey].push(aNode);
  },
  addResetMethod : function(aKey, aNode) {
    aNode.$reset = () => {
      var value = this.configs[aKey] =
          this.configs.$default[aKey];
      if (this.detectUIType(aNode) == this.UI_TYPE_CHECKBOX)
        aNode.checked = value;
      else
        aNode.value = value;
    };
  },

  onReady : function()
  {
    document.removeEventListener('DOMContentLoaded', this.onReady);

    if (!this.configs || !this.configs.$loaded)
      throw new Error('you must give configs!');

    this.configs.$addObserver(this.onConfigChanged);
    this.configs.$loaded
      .then((function() {
        Object.keys(this.configs.$default).forEach(function(aKey) {
          var node = this.findUIForKey(aKey);
          if (!node)
            return;
          switch (this.detectUIType(node))
          {
            case this.UI_TYPE_CHECKBOX:
              this.bindToCheckbox(aKey, node);
              break;

            case this.UI_TYPE_RADIO:
              this.bindToRadio(aKey);
              break;

            case this.UI_TYPE_TEXT_FIELD:
              this.bindToTextField(aKey, node);
              break;

            case this.UI_TYPE_SELECTBOX:
              this.bindToSelectBox(aKey, node);
              break;

            case this.UI_MISSING:
              return;

            default:
              throw new Error('unknown type UI element for ' + aKey);
          }
        }, this);
      }).bind(this));
  },

  onConfigChanged : function(aKey)
  {
    var nodes = this.uiNodes[aKey];
    if (!nodes) // possibly radio
      nodes = this.uiNodes[aKey + '-' + configs[aKey]];
    if (!nodes || !nodes.length)
      return;

    for (let node of nodes) {
      if ('checked' in node) {
        node.checked = !!this.configs[aKey];
      }
      else {
        node.value = this.configs[aKey];
      }
      node.disabled = this.configs.$locked[aKey];
    }
  },

  buildUIForAllConfigs : function(aParent)
  {
    var parent = aParent || document.body;
    var range = document.createRange();
    range.selectNodeContents(parent);
    range.collapse(false);
    var rows = [];
    for (let key of Object.keys(this.configs.$default)) {
      let value = this.configs.$default[key];
      let type = typeof value == 'number' ? 'number' :
            typeof value == 'boolean' ? 'checkbox' :
            'text' ;
      rows.push(`
        <tr>
          <td><label for="allconfigs-field-${key}">${key}</label></td>
          <td><input id="allconfigs-field-${key}"
                     type="${type}"></td>
          <td><button id="allconfigs-reset-${key}">Reset</button></td>
        </tr>
      `);
    }
    var fragment = range.createContextualFragment(`<table><tbody>${rows.join('')}</tbody></table>`);
    range.insertNode(fragment);
    range.detach();
    var table = parent.lastChild;
    Array.slice(table.querySelectorAll('input')).forEach(aInput => {
      var key = aInput.id.replace(/^allconfigs-field-/, '');
      switch (this.detectUIType(aInput))
      {
        case this.UI_TYPE_CHECKBOX:
          this.bindToCheckbox(key, aInput);
          break;

        case this.UI_TYPE_TEXT_FIELD:
          this.bindToTextField(key, aInput);
          break;
      }
      var button = table.querySelector(`#allconfigs-reset-${key}`);
      button.addEventListener('click', () => {
        input.$reset();
      });
      button.addEventListener('keypress', (aEvent) => {
        if (aEvent.keyCode == aEvent.DOM_VK_ENTER ||
          aEvent.keyCode == aEvent.DOM_VK_RETURN)
          input.$reset();
      });
    });
  }
};
