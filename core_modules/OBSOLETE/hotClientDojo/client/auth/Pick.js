define([
  "dojo/_base/declare"
, "dojo/dom-construct"

, "dijit/_WidgetBase"
, "dijit/_TemplatedMixin"
, "dijit/_WidgetsInTemplateMixin"
, "dijit/Destroyable"
, "dijit/form/Button"
, "dijit/form/ValidationTextBox"

, "dijit/layout/BorderContainer"
, "dijit/_Container"
, "dijit/layout/_ContentPaneResizeMixin"

, "dgrid/List"
, "dgrid/OnDemandList"
, "dgrid/Selection"
, "dgrid/Keyboard"
, "dgrid/extensions/DijitRegistry"
, "put-selector/put"

, "hotplate/hotClientDojo/auth/NewWorkspace"
, "hotplate/hotClientDojo/widgets/TempDialog"
, "hotplate/hotClientDojo/widgets/_OverlayMixin"
, "hotplate/hotClientDojo/stores/stores"
, "hotplate/hotClientDojo/comet/_TabRegisterMixin"
, "hotplate/hotClientDojo/widgets/widgets"

], function(

  declare

, domConstruct
, _WidgetBase
, _TemplatedMixin
, _WidgetsInTemplateMixin
, Destroyable
, Button
, ValidationTextBox

, BorderContainer
, _Container
, _ContentPaneResizeMixin

, List
, OnDemandList
, Selection
, Keyboard
, DijitRegistry
, put

, NewWorkspace
, TempDialog
, _OverlayMixin
, stores
, _TabRegisterMixin
, widgets

){

    return declare( [ widgets.DestroyableTemplatedContainer, _ContentPaneResizeMixin, _OverlayMixin ], {

    widgetsInTemplate: true,

    templateString: '' +
      '<div>\n' +
      '  <div id="pick-widget" data-dojo-type="dijit/layout/BorderContainer" data-dojo-attach-point="containerWidget">\n'+
      '    <div data-dojo-type="dijit/form/Button" data-dojo-attach-point="newWorkspaceButton" data-dojo-props="region: \'top\'">Create new workspace</div>\n'+
      '  </div>\n'+
     '</div>\n' +
      '',

    renderRow: function( o ){
      return domConstruct.create("div", {
        innerHTML: o._children.workspaceId.workspaceName
      });
    },

    postCreate:function(){
      var self = this;

      // List of workspaces
      var ListConstructor = declare( [ OnDemandList, Selection, Keyboard, DijitRegistry ], {
        renderRow: self.renderRow,
        selectionMode: 'single',
        collection: stores('usersWorkspaces', { userId: vars['hotCoreAuth']['userId']}),
        region: 'center',
      } );

      self.listWidget = new ListConstructor({});
      self.containerWidget.addChild( self.listWidget );

      // New workspace button
      self.newWorkspaceButton.on('click', function(e) {
        var tempDialog = new TempDialog();
        var f = new NewWorkspace();
        tempDialog.addChild( f );
        tempDialog.startup();
      });

      // When picking a workspace, jump to the designated result page
      self.listWidget.on('click,keydown', function( e ){
        if( e.keyCode === 13 || e.type === 'click' ){
          var row =  self.listWidget.row( e );
          if( row ){
            window.location = vars.hotClientDojo.appRoute.replace( ':workspaceId', row.data.workspaceId );
          }
        }
      });
      this.inherited(arguments);

    },

  });

});
