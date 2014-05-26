var express = require('express');
var OAuth = require('oauth').OAuth;
var Q = require('q');
var morgan = require('morgan'); // previously logger
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var passport = require('passport');
var app = express();
var cookieParser = require('cookie-parser');
var session = require('express-session');
var utils = require('./lib/util.js');
var fitbitGet = require('./fitbitGet.js');
var Q = require('q');
var request = require('request');
var JawboneStrategy = require('./passport-jawbone.js');
var FitbitStrategy = require('./passport-fitbit.js');
var jawboneup = require('jawbone-up');

// move to modularize later
var db = require('./appData/config.js');
var User = require('./appData/models/user.js');

/******************************************************

IMPORTANT BACKEND/SERVER SIDE LOGIC FOR IONIC FITRPG APP
STARTS HERE

********************************************************/

// Passport credential configs, sign up
var FITBIT_CONSUMER_KEY = '8cda22173ee44a5bba066322ccd5ed34';
var FITBIT_CONSUMER_SECRET = '12beae92a6da44bab17335de09843bc4';
exports.fitbitClient = new utils.FitbitAPIClient(FITBIT_CONSUMER_KEY, FITBIT_CONSUMER_SECRET);

var Jawbone = {
  authorizeT: 'https://jawbone.com/auth/oauth2/token',
  client_id: 'ONz6lq9qyb8',
  secret: '4db8566134bb2ccab904bf6fb3c0b6fee563193b',
  callback: 'https://fitbitrpg.azurewebsites.net/jawbonecallback' //if I change this, change on dev site
}

// returns sufficient identifying information to recover the user account on any subsequent requests
// specifically the second parameter of the done() method is the information serialized into the session data
passport.serializeUser(function (user, done) {
  done(null, user.originalId);
});

// deserialize returns the user profile based on the identifying information that was serialized 
// to the session
passport.deserializeUser(function (id, done) {
  User.findOne({originalId: id}, function (err, user) {
    done(err, user);
  });
});

var fitbitStrategy = new FitbitStrategy({
    consumerKey: FITBIT_CONSUMER_KEY,
    consumerSecret: FITBIT_CONSUMER_SECRET,
    callbackURL: "/auth/fitbit/callback"
  },
  function (token, tokenSecret, profile, done) {
    process.nextTick(function () {
      exports.token = token;
      exports.tokenSecret = tokenSecret;
      User.findOne({
        originalId: profile.id,
        provider: profile.provider
      }, function (err,foundUser) {
        if (foundUser) {
          done(null, foundUser);//eventually remove this and only do it for new users, why is this even here,idk
        } else {
          var newUser = new User({
            originalId: profile.id,
            provider: profile.provider,
            displayName: profile.displayName
          });
          newUser.save(function (err, savedUser) {
            if (err) {throw err}
            fitbitGet.subscribeUser(savedUser.originalId, function() {
              done(null, savedUser);
            });
          });
        }
      });
    });
  }
);

passport.use(fitbitStrategy);

// CREATES JAWBONE STRATEGY
var jawboneStrategy = new JawboneStrategy({
  clientID: Jawbone.client_id, 
  clientSecret: Jawbone.secret,
  callbackURL: Jawbone.callback
  },
  function(accessToken,refreshToken,profile,done) {
   // passport broke so it doesn't quite ever get here
   // basically i do passport.authenticate twice
   // and it doesn't seem to do the second one for some reason
   // so i just do it myself
  }
);
passport.use(jawboneStrategy);
/******************************************************
IMPORTANT BACKEND/SERVER SIDE LOGIC FOR IONIC FITRPG APP
ENDS HERE
********************************************************/



/***********
Basic app configurations
************/
//app.use(morgan()); //annoying logger every time server runs
app.use(cookieParser());
app.use(bodyParser());
app.use(methodOverride());
app.use(session({secret: 'keyboard cat',maxAge: 360 * 5}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));

// Home page, either redirects to main page or to login
app.get('/', utils.ensureAuthenticated, function (req, res) {
  res.redirect('/FitbitRPG');
});
// Main game page, when we load it we want to make sure we get all the data
app.get('/FitbitRPG', utils.ensureAuthenticated, fitbitGet.getAllFitbitData);
app.get('/profile', utils.ensureAuthenticated, fitbitGet.getProfile);
// app.get('/friends', utils.ensureAuthenticated, fitbitGet.getFriends);
app.get('/allStats', utils.ensureAuthenticated, fitbitGet.getAllStats);
app.get('/error', function(req, res) {
  res.sendfile(__dirname + '/public/client/templates/error.html');
});
app.get('/homes', function (req, res) {
  User.find({}, function(err,user) {
    console.log('USER', err, user);
  });
  res.sendfile(__dirname + '/public/client/templates/homes.html');
});

// Functionality for receiving push notifications from fitbit
// Definitely want to integrate a type of security and not accept post requests from just anyone
app.post('/fitbitpush', function (req, res) {
  // HERE WE RECEIVE THE PUSH NOTIFICATION, MAKE A CALL TO RETRIEVE THE DATA
  res.set('Content-Type', 'application/json');
  res.send(204);
});


// Performs a function 'logout', not 100% sure what that entails quite yet.
app.get('/logout', function (req, res) {
  req.logout();
  res.redirect('/');
});


/******************************************************

IMPORTANT BACKEND/SERVER SIDE LOGIC FOR IONIC FITRPG APP
STARTS HERE

********************************************************/

// Sends the user to get authenticated with fitbit
app.get('/auth/fitbit',
  passport.authenticate('fitbit'),
  function (req, res) {
    // The request will be redirected to Fitbit for authentication, so this
    // function will not be called.
  });

// GET /auth/fitbit/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/fitbit/callback',
  passport.authenticate('fitbit', {
    failureRedirect: '/error'
  }),
  function (req, res) {
    var userToken = req.query['oauth_token']; //save this token to the DB and get the user info and save that too
    //then redirect with the token AND the user id and then make sure the client checks for
    // that and saves both things
    res.send(200,JSON.stringify({'thing':[]}));
});


//testing, var jsonObjj = {'access_token':'1232131'};
// DO JAWBONE PASSPORT MAGIC HERE
app.get('/jawbone', 
  passport.authenticate('jawbone'),
  function (req, res) {
});

app.get('/test', function(req,res) {
  var access_token = 'r5ZHAAV8pCX9k1olb9Fy1jJ31m-ibPB2hz2FQ37ilWyOqd1BT-wDzuegii84k3KKkKMwPvEBJ55RAnYEZaPxlCzIBmUtBLpsaym2RYjpp5gDwoQTw2eSTw';
  jawboneStrategy.getUserProfile(access_token, function(profile) {
          console.log(profile.image, profile.xid);
        });
});

app.get('/jawbonecallback',
  function (req, res) {
    var jawboneTempCode = req.query['code']; //this code expires in 10 minutes
    var url = Jawbone.authorizeT + '?grant_type=authorization_code&' + 'client_id=' + Jawbone.client_id + '&client_secret=' + Jawbone.secret + '&code=' + jawboneTempCode;
    request.get(url, function (err,thing,jsonObj) {
      if (err) { res.send(err)}
        jsonObj = JSON.parse(jsonObj);
        access_token = jsonObj['access_token']; 
        // with this token we can get the user profile and if it exists, we'll get it, if not, we'll make it
        var user =  {};
        jawboneStrategy.getUserProfile(access_token, function(profile) { //async!
          user.xid = profile.xid;
          user.avatar = profile.image;
          user.displayName = profile.first + profile.last;
          user.provider =  profile.provider;
          var newUrl = '/jawbonetoken?token=' + access_token + '&userid=' + user.xid;
          res.redirect(newUrl);
        });
        //THIS LINE WORKS: res.send(JSON.stringify({'thing':[]}));
    });
});

app.get('/jawbonetoken', function(req,res) {
  res.send(JSON.stringify({'close':[]}));
});

/******************************************************
IMPORTANT BACKEND/SERVER SIDE LOGIC FOR IONIC FITRPG APP
ENDS HERE
********************************************************/

module.exports = app;