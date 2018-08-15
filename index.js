const authAPI = require('./config/twitter.js');
const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const session = require('express-session');
const Users = require('./db.js').Users;
const Tokens = require('./db.js').Tokens;
const TokenTracker = require('./db.js').TokenTracker;
let port = process.env.PORT || 3001;

const transformTwitterProfile = (profile) => ({
  id: profile.id
});

// Register Twitter Passport strategy
passport.use(new TwitterStrategy({
	consumerKey: authAPI.TWITTER_CONSUMER_KEY,
	consumerSecret: authAPI.TWITTER_CONSUMER_SECRET,
	callbackUrl: 'https://api.lookingglassapp.xyz/auth/twitter/callback'
  },
  // Gets called when user authorizes access to their profile
  async (token, tokenSecret, profile, done) => {
    try {
      let userQuery = {};
      let userId = profile.id;
      let userProfile = profile._json;
      userQuery['id'] = userId;
      let user = await Users.findOne(userQuery);
      let tokenTracker = await TokenTracker.findOne({id: 1});
      let newTotalTokens = tokenTracker ? (!user ? tokenTracker.totalTokens + 1 : tokenTracker.totalTokens) : 1;
      let currentToken = tokenTracker ? (tokenTracker.currentToken ?  tokenTracker.currentToken : 1) : 1;
      let tokenTrackerQuery = {};
      tokenTrackerQuery['id'] = 1;
      let tokenTrackerUpdateObject = {};
      tokenTrackerUpdateObject['id'] = 1;
      tokenTrackerUpdateObject['totalTokens'] = newTotalTokens;
      tokenTrackerUpdateObject['currentToken'] = currentToken;
      if (!user) {
        let tokenTrackerResponse = await TokenTracker.findOneAndUpdate(tokenTrackerQuery, tokenTrackerUpdateObject, {new: true, upsert: true});
      }
      let tokenQuery = {};
      tokenQuery['id'] = user ? (user.tokenNumber ? user.tokenNumber : newTotalTokens) : newTotalTokens;
      let tokenUpdateObject = {};
      tokenUpdateObject['id'] = user ? (user.tokenNumber ? user.tokenNumber : newTotalTokens) : newTotalTokens;
      tokenUpdateObject['twitterTokenKey'] = token;
      tokenUpdateObject['twitterTokenSecret'] = tokenSecret;
      let tokenResponse = await Tokens.findOneAndUpdate(tokenQuery, tokenUpdateObject, {new: true, upsert: true});
      let userObject = {};
      userObject['id'] = userId;
      userObject['twitterTokenKey'] = token 
      userObject['twitterTokenSecret'] = tokenSecret 
      userObject['tokenNumber'] = user ? (user.tokenNumber ? user.tokenNumber : newTotalTokens) : newTotalTokens;
      let userDocument = await Users.findOneAndUpdate(userQuery, userObject, {upsert: true});
      return done(null, transformTwitterProfile(userProfile));
    } catch(err) {
      console.log('error in strategy creation', err);
      return done(err);
    }
  }
));

// Serialize user into the sessions
passport.serializeUser((user, done) => done(null, user));

// Deserialize user from the sessions
passport.deserializeUser((user, done) => done(null, user));

var app = express();
// Logging and parsing
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cors());

app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: 'bla bla bla' 
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// health check
app.get('/health', (req, res) => {
  res.writeHead(200);
  res.end('healthy');
})

// Set up Twitter auth routes
app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { failureRedirect: '/auth/twitter' }),
  // Redirect user back to the mobile app using Linking with a custom protocol LookingGlass
  (req, res) => res.redirect('LookingGlass://login?user=' + JSON.stringify(req.user)));

app.listen(port, () => {
	console.log(`listening on port ${port}`);
})