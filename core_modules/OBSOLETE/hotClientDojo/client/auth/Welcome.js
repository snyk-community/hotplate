define([
  "dojo/_base/declare"

, "dijit/_WidgetBase"
, "dijit/_TemplatedMixin"
, "dijit/_WidgetsInTemplateMixin"

, "dijit/layout/ContentPane"
, "dijit/_Container"
, "dijit/layout/_ContentPaneResizeMixin"

, "hotplate/hotClientDojo/auth/panels/SignInRecoverRegister"
, "hotplate/hotClientDojo/widgets/FadingTabContainer"


], function(
  declare

, _WidgetBase
, _TemplatedMixin
, _WidgetsInTemplateMixin

, ContentPane
, _Container
, _ContentPaneResizeMixin

, SignInRecoverRegister
, FadingTabContainer

){

  // Create the "login" pane, based on a normal ContentPane
  return declare( [_WidgetBase, _Container, _ContentPaneResizeMixin, _TemplatedMixin, _WidgetsInTemplateMixin ], {

    widgetsInTemplate: true,

    templateString: '' +
      '<div>\n' +
      '  <div data-dojo-type="hotplate/hotClientDojo/widgets/FadingTabContainer">\n'+
      '    \n'+
      '    <div data-dojo-type="dijit/layout/ContentPane" title="Sign in">\n'+
      '      <p span="login-here">Login here</span></p>\n'+
      '      <div data-dojo-type="hotplate/hotClientDojo/auth/panels/SignInRecoverRegister" data-dojo-props="action:\'signin\'"></div>\n'+
      '    </div>\n'+
      '    \n'+
      '    <div data-dojo-type="dijit/layout/ContentPane" title="Recover">\n'+
      '      <p>Recoved your account</p>\n'+
      '      <div data-dojo-type="hotplate/hotClientDojo/auth/panels/SignInRecoverRegister" data-dojo-props="action:\'recover\'"></div>\n'+
      '    </div>\n'+
      '    \n'+
      '    <div data-dojo-type="dijit/layout/ContentPane" title="Register">\n'+
      '      <p>Create an account</p>\n'+
      '      <div data-dojo-type="hotplate/hotClientDojo/auth/panels/SignInRecoverRegister" data-dojo-props="action:\'register\'"></div>\n'+
      '    </div>\n'+
      '  </div>\n'+
      '</div>\n'+
      '',
   });

});



