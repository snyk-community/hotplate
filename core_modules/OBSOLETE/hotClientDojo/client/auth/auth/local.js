/*

  TODO:
  * Check that login box greys out when updated
*/

define( [

  "dojo/_base/declare"
, "dojo/dom-style"
, "dojo/request"
, "dojo/cookie"
, "dojo/topic"

, "dijit/form/Form"
, "dijit/_WidgetBase"
, "dijit/_TemplatedMixin"
, "dijit/_WidgetsInTemplateMixin"
, "dijit/_OnDijitClickMixin"

, "hotplate/hotClientDojo/widgets/_OverlayMixin"
, "hotplate/hotClientDojo/submit/defaultSubmit"
, "hotplate/hotClientDojo/widgets/BusyButton"
, "hotplate/hotClientDojo/widgets/TempDialog"
, "hotplate/hotClientDojo/auth/ValidationUsername"

, "../buttons/_SignInRecoverRegisterButton"
, "../buttons/_ManagerButton"
, "../buttons/_ResumeButton"

], function(

  declare
, domStyle
, request
, cookie
, topic

, Form
, _WidgetBase
, _TemplatedMixin
, _WidgetsInTemplateMixin
, _OnDijitClickMixin

, _OverlayMixin
, ds
, BusyButton
, TempDialog
, ValidationUsername

, _SignInRecoverRegisterButton
, _ManagerButton
, _ResumeButton

){

  var ret = {};
  var urlPrefix = vars.hotCorePage.routeUrlsPrefix;

  ret.SignIn = declare( [ _SignInRecoverRegisterButton ], {
    strategyId: 'local',

    postCreate: function(){
      this.inherited( arguments );

      var self = this;

      var F = declare( [ _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin ] , {

        templateString: '' +
          '<div>\n' +
          '  <div>\n' +
          '    <form data-dojo-type="dijit/form/Form" data-dojo-attach-point="formWidget">\n' +
          '      <label for="${id}_login">Login</label>\n' +
          '      <input name="login" id="${id}_login" data-dojo-type="hotplate/hotClientDojo/auth/ValidationUsername" data-dojo-attach-point="login" data-dojo-props="required: true, ajaxOkWhen:\'present\', ajaxInvalidMessage:\'Login name invalid!\'"></input>\n' +
          '      <label for="${id}_password">Password</label>\n' +
          '      <input type="password" name="password" id="${id}_password" data-dojo-attach-point="password" data-dojo-type="dijit/form/TextBox" ></input>\n' +
          '      <input class="form-submit" type="submit" data-dojo-attach-point="buttonWidget" data-dojo-type="hotplate/hotClientDojo/widgets/BusyButton", label="Go"></input>\n' +
          '    </form>\n' +
          '  </div>\n' +
          '</div>\n' +
          '',
      });


      self.button.on('click', function( e ){

        cookie( 'local-signin', 'ajax', { path: '/' } );

        var f = new F( ) ;
        var formDialog = new TempDialog();
        formDialog.addChild( f );
        formDialog.startup();

        f.formWidget.on( 'submit', ds.defaultSubmit( f.formWidget, f.buttonWidget, function(){

          var data = f.formWidget.get('value');
          //data.responseType = 'ajax';
          request.post( urlPrefix + '/auth/signin/local/postcheck', { data: data } ).then(
            function( res ){
              try {
                res = JSON.parse( res );
              } catch( e ) {};

              // That's all
              formDialog.hide();
              var successURL = vars['hotCoreAuth']['successURLs']['signin'];

              if( typeof( successURL) === 'undefined' ){
                throw("The setting vars['hotCoreAuth']['successURLs']['signin'] is not set");
              } else {
                window.location = successURL;
              }

            },
            function( err ){
              f.buttonWidget.cancel();
              self._displayError( err );
            }
          );

          return false;
        }));

      });
    },


  });


  ret.Recover = declare( [ _SignInRecoverRegisterButton ], {
    strategyId: 'local',

    postCreate: function(){
      this.inherited(arguments);

      var self = this;

      var F = declare( [ _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin ] , {

        templateString: '' +
          '<div>\n' +
          '  <div>\n' +
          '    <form data-dojo-type="dijit/form/Form" data-dojo-attach-point="formWidget">\n' +
          '      <label for="${id}_login">Login</label>\n' +
          '      <input name="login" id="${id}_login" data-dojo-type="hotplate/hotClientDojo/auth/ValidationUsername" data-dojo-attach-point="login" data-dojo-props="required: true, ajaxOkWhen:\'present\', ajaxInvalidMessage:\'Login name invalid!\'"></input>\n' +
          '      <input class="form-submit" type="submit" data-dojo-attach-point="buttonWidget" data-dojo-type="hotplate/hotClientDojo/widgets/BusyButton", label="Go"></input>\n' +
          '    </form>\n' +
          '  </div>\n' +
          '</div>\n' +
          '',
      });

      self.button.on('click', function( e ){

        cookie( 'local-recover', 'ajax', { path: '/' } );

        var f = new F( ) ;
        var formDialog = new TempDialog();
        formDialog.addChild( f );
        formDialog.startup();

        f.formWidget.on( 'submit', ds.defaultSubmit( f.formWidget, f.buttonWidget, function(){

          var data = f.formWidget.get('value');
          data.password = 'dummy';
          request.post( urlPrefix + '/auth/recover/local/postcheck', { data: data } ).then(
            function( res ){
              try {
                res = JSON.parse( res );
              } catch( e ) {};

              // That's all
              formDialog.hide();
            },
            function( err ){
              f.buttonWidget.cancel();
              self._displayError( err );
              formDialog.hide();
            }
          );

          return false;
        }));

      });
    },


  });

  ret.Register = declare( [ _SignInRecoverRegisterButton ], {
    strategyId: 'local',

    postCreate: function(){
      this.inherited( arguments );

      var self = this;

      var F = declare( [ _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin ] , {

        templateString: '' +
          '<div>\n' +
          '  <div>\n' +
          '    <form data-dojo-type="dijit/form/Form" data-dojo-attach-point="formWidget">\n' +
          '      <label for="${id}_login">Login</label>\n' +
          '      <input name="login" id="${id}_login" data-dojo-type="hotplate/hotClientDojo/auth/ValidationUsername" data-dojo-attach-point="login" data-dojo-props="required: true, ajaxOkWhen:\'absent\', ajaxInvalidMessage:\'Login name taken!\'"></input>\n' +
          '      <label for="${id}_password">Password</label>\n' +
          '      <input type="password" name="password" id="${id}_password" data-dojo-attach-point="password" data-dojo-type="dijit/form/TextBox" ></input>\n' +
          '      <label for="${id}_passwordConfirm">Confirm password</label>\n' +
          '      <input type="password" name="passwordConfirm" id="${id}_passwordConfirm" data-dojo-attach-point="passwordConfirm" data-dojo-type="dijit/form/ValidationTextBox" data-dojo-props="validator: this.passwordMatch.bind( this ), invalidMessage:\'Passwords must match\'" ></input>\n' +
          '      <input class="form-submit" type="submit" data-dojo-attach-point="buttonWidget" data-dojo-type="hotplate/hotClientDojo/widgets/BusyButton", label="Go"></input>\n' +
          '    </form>\n' +
          '  </div>\n' +
          '</div>\n' +
          '',

        passwordMatch: function( p ){
          return p === this.password.value;
        },
      });


      self.button.on('click', function( e ){

        cookie( 'local-register', 'ajax', { path: '/' } );

        var f = new F( ) ;
        var formDialog = new TempDialog();
        formDialog.addChild( f );
        formDialog.startup();

        f.formWidget.on( 'submit', ds.defaultSubmit( f.formWidget, f.buttonWidget, function(){

          var data = f.formWidget.get('value');
          //data.responseType = 'ajax';
          request.post( urlPrefix + '/auth/register/local/postcheck', { data: data } ).then(
            function( res ){
              try {
                res = JSON.parse( res );
              } catch( e ) {};

              // That's all
              formDialog.hide();
              var successURL = vars['hotCoreAuth']['successURLs']['register'];

              if( typeof( successURL) === 'undefined' ){
                throw("The Login widget must be used in a hotClientDojo login form where vars['hotCoreAuth']['successURL'] is set");
              } else {
                window.location = successURL;
              }

            },
            function( err ){
              f.buttonWidget.cancel();
              self._displayError( err );
            }
          );

          return false;
        }));

      });
    },

  });

  ret.Resume = declare( [ _ResumeButton ], {
    strategyId: 'local',
    attempts: 0,


    postCreate: function(){
      this.inherited( arguments );

      var self = this;

      var F = declare( [ _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin ] , {

        login: null,

        templateString: '' +
          '<div>\n' +
          '  <div>\n' +
          '    <form data-dojo-type="dijit/form/Form" data-dojo-attach-point="formWidget">\n' +
          '      <input data-dojo-type="dijit/form/TextBox" type="hidden" name="login" value="${login}"></input>\n' +
          '      <label for="${id}_password">Password</label>\n' +
          '      <input type="password" name="password" id="${id}_password" data-dojo-attach-point="password" data-dojo-type="dijit/form/TextBox" ></input>\n' +
          '      <input class="form-submit" type="submit" data-dojo-attach-point="buttonWidget" data-dojo-type="hotplate/hotClientDojo/widgets/BusyButton", label="Go"></input>\n' +
          '    </form>\n' +
          '  </div>\n' +
          '</div>\n' +
          '',
      });


      self.button.on('click', function( e ){

        cookie( 'local-resume', 'ajax', { path: '/' } );


        topic.publish( 'hotClientDojo/auth/resuming' );


        // Make up the new form, with `login` as a hidden value
        var f = new F( { login: self.userStrategyData.field1 } ) ;
        var formDialog = new TempDialog();
        formDialog.addChild( f );
        formDialog.startup();

        // On submit, try to resume -- if it doesn't work, redirect to main login page
        f.formWidget.on( 'submit', ds.defaultSubmit( f.formWidget, f.buttonWidget, function(){

          var data = f.formWidget.get('value');
          //data.responseType = 'ajax';

          request.post( urlPrefix + '/auth/resume/local/postcheck', { data: data } ).then(

            // It worked! User is back in, all good
            function( res ){

              // That's all -- hide the form, reset attempt count
              formDialog.hide();
              self.attempts = 0;
              window.alert("You are logged back in!");
            },

            // Boo! Things didin't work -- user will have 3 attempts
            function( err ){


              // Only raise `attempts` if it was an actual 403
              if(  err.response &&  err.response.status == 403 ){
                self.attempts ++;
              }

              f.buttonWidget.cancel();

              // Display the error
              self._displayError( err );

              // Back to welcome page after 3 tries -- or, reset the password for new attempt
              if( self.attempts > 2 ){
                window.location = vars['hotCoreAuth']['failURLs']['signin'];
              } else {
                f.password.set('value',null);
              }
            }
          );

          return false;
        }));

      });
    },


  });




  ret.Manager = declare( [ _ManagerButton ], {

    strategyId: 'local',

    postCreate: function(){
      this.inherited( arguments );

      var self = this;

      var F = declare( [ _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin ] , {

        templateString: '' +
          '<div>\n' +
          '  <div>\n' +
          '    <form data-dojo-type="dijit/form/Form" data-dojo-attach-point="formWidget">\n' +
          '      <label for="${id}_login">Login</label>\n' +
          '      <input name="login" id="${id}_login" value="${login}" data-dojo-type="hotplate/hotClientDojo/auth/ValidationUsername" data-dojo-attach-point="login", data-dojo-props="alwaysOk: \'${login}\', required: true, ajaxOkWhen:\'absent\', ajaxInvalidMessage:\'Login name taken!\'" ></input>\n' +
          '      <label for="${id}_password">Password</label>\n' +
          '      <input type="password" name="password" id="${id}_password" data-dojo-attach-point="password" data-dojo-type="dijit/form/TextBox"></input>\n' +
          '      <label for="${id}_passwordConfirm">Confirm password</label>\n' +
          '      <input type="password" name="passwordConfirm" id="${id}_passwordConfirm" data-dojo-attach-point="passwordConfirm" data-dojo-type="dijit/form/ValidationTextBox" data-dojo-props="validator: this.passwordMatch.bind( this ), invalidMessage:\'Passwords must match\'" ></input>\n' +
          '      <input class=form-submit type="submit" data-dojo-attach-point="buttonWidget" data-dojo-type="hotplate/hotClientDojo/widgets/BusyButton" label="Go"></input>\n' +
          '    </form>\n' +
          '  </div>\n' +
          '  <button data-dojo-attach-point="deleteButtonWidget" data-dojo-type="hotplate/hotClientDojo/widgets/BusyButton" label="Delete" />\n' +
          '</div>\n' +
          '',

        passwordMatch: function( p ){
          return p === this.password.value;
        },

      });


      self.button.on('click', function( e ){

        cookie( 'local-manager', 'ajax', { path: '/' } );

        // Make up the Constructor Parameters for the form
        var cp = { login: '', password: '' };
        if( self.userStrategyData ) cp = { login: self.userStrategyData.field1.toLowerCase(), password: self.userStrategyData.field3 };

        var f = new F( cp ) ;
        if( ! self.userStrategyData ){
          domStyle.set( f.deleteButtonWidget.domNode, 'display', 'none' );
        }
        var formDialog = new TempDialog();
        formDialog.addChild( f );
        formDialog.startup();

        f.formWidget.on( 'submit', ds.defaultSubmit( f.formWidget, f.buttonWidget, function(){
        //f.formWidget.on( 'submit', function( e ){

          var data = f.formWidget.get('value');

          // Small hack to keep Passport happy: if the password is empty,
          // then assign a '*' to it, so that it will get sent.
          if( data.password == '' ) data.password = '*';

          //data.responseType = 'ajax';
          request.post( urlPrefix + '/auth/manager/local/postcheck', { data: data } ).then(
            function( res ){
              try {
                res = JSON.parse( res );
              } catch( e ) {};

              // Pre-emptive changes to self.strategydata, so that the data is editable
              // straight away
              self.userStrategyData = {};
              self.userStrategyData.field1 = f.formWidget.get('value').login.toLowerCase();
              self.userStrategyData.field3 = f.formWidget.get('value').password;
              self.userStrategyData.id = res.user[ 'usersStrategiesId' ];

              // Update what's "always OK" for the validator call. Not strictly
              // necessary as the form will close.
              f.login.alwaysOk = f.formWidget.get('value').username;

              // That's all

              formDialog.hide();
            },
            function( err ){
              f.buttonWidget.cancel();
              self._displayError( err );
            }
          );

          return false;
        }));
        //});


        f.deleteButtonWidget.on( 'click', function( e ){
          self._deleteStrategyData( "Delete credentials?", "Are you sure you want to invalidate your login/password credentials?" ).then(
            function( res ){
              formDialog.hide();
            }
          );
        });


      });
    },

  });

  return ret;
});
