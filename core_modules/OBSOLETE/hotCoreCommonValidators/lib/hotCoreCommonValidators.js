"use strict";

var hotplate = require('hotplate');


hotplate.hotEvents.onCollect( 'sharedFunctions', 'hotCoreCommonValidators', hotplate.cacheable( function( done ) {

  var result = {};

  // Not emptyString (str is cast to string)
  result.notEmptyStringValidator = function(str){

    if(str === false) return "Value cannot be empty";
    return str == '';
  }

  // Only letters allowed
  result.onlyLettersValidator = function(str){
    if(str === false) return "Can only contain letters";
    return true;
  }


  // Login validator
  result.loginValidator = function(str){

    // FIXME: Check that the input is indeed a string

    if(str === false) return "Cannot be empty and can only contain letters, number and '.'";

    if( str.length == 0 ) return false;
    if( str.match(/[^a-zA-Z0-9\.]/) ) return false;
    return true;
  }

  // Workspace validator
  result.workspaceValidator = function(str){
    if(str === false) return "Can be empty and can only contain letters and numbers";

    if( str.length == 0 ) return false;
    if( str.match(/[^a-zA-Z0-9]/) ) return false;
    return true; 
  }

  // Email validator
  // http://rosskendall.com/blog/web/javascript-function-to-check-an-email-address-conforms-to-rfc822
  result.emailValidator = function(str){

    if(str === false) return "Email format not valid";

    var sQtext = '[^\\x0d\\x22\\x5c\\x80-\\xff]';
    var sDtext = '[^\\x0d\\x5b-\\x5d\\x80-\\xff]';
    var sAtom = '[^\\x00-\\x20\\x22\\x28\\x29\\x2c\\x2e\\x3a-\\x3c\\x3e\\x40\\x5b-\\x5d\\x7f-\\xff]+';
    var sQuotedPair = '\\x5c[\\x00-\\x7f]';
    var sDomainLiteral = '\\x5b(' + sDtext + '|' + sQuotedPair + ')*\\x5d';
    var sQuotedString = '\\x22(' + sQtext + '|' + sQuotedPair + ')*\\x22';
    var sDomain_ref = sAtom;
    var sSubDomain = '(' + sDomain_ref + '|' + sDomainLiteral + ')';
    var sWord = '(' + sAtom + '|' + sQuotedString + ')';
    var sDomain = sSubDomain + '(\\x2e' + sSubDomain + ')*';
    var sLocalPart = sWord + '(\\x2e' + sWord + ')*';
    var sAddrSpec = sLocalPart + '\\x40' + sDomain; // complete RFC822 email address spec
    var sValidEmail = '^' + sAddrSpec + '$'; // as whole string

    var reValidEmail = new RegExp(sValidEmail);
     
    return reValidEmail.test(str);
  }

  done( null, result );

}));

