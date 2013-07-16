var twitterBackup = (function () {
    'use strict';

    var showAlert = function(message, title, callback) {

        navigator.notification.alert(message, callback || function () {}, title, 'OK');
    };

    var showError = function(message) {

        showAlert(message, 'Error occured');
    };

    window.addEventListener('error', function (e) {

        e.preventDefault();

        var message = e.message + "' from " + e.filename + ":" + e.lineno;

        showAlert(message, 'Error occured');
        return true;
    });

    var onBackKeyDown = function(e) {

        e.preventDefault();

        navigator.notification.confirm('Do you really want to exit?', function (confirmed) {

            var exit = function () {
                navigator.app.exitApp();
            };

            if (confirmed === true || confirmed === 1) {
                AppHelper.logout().then(exit, exit);
            }

        }, 'Exit', 'Ok,Cancel');
    };

    var onDeviceReady = function() {
        document.addEventListener("backbutton", onBackKeyDown, false);
    };

    document.addEventListener("deviceready", onDeviceReady, false);

    var appSettings = {
        emptyGuid: '00000000-0000-0000-0000-000000000000',
        apiKey: 'j7lEuhSVpasfyOba',
        twitterUrl: 'http://apitwitter.herokuapp.com/users'
    };

    var el = new Everlive({
        apiKey: appSettings.apiKey
    });

    var AppHelper = {

        logout: function () {
            return el.Users.logout();
        }
    };

    var mobileApp = new kendo.mobile.Application(document.body, {
        transition: 'slide',
        layout: 'default',
        platform: 'ios'
    });

    var EventsAggregator = new kendo.Observable();

    /*** User Model ***/
    var userModel = (function () {

        var currentUser = kendo.observable({ data: null });

        var loadUser = function () {

            return el.Users.currentUser()
            .then(function (data) {

                currentUser.set('data', data.result);
                EventsAggregator.trigger('user/logged');
            })
            .then(null,
                function (err) {
                    showError(err.message);
                }
            );
        };

        return {
            load: loadUser,
            currentUser: currentUser
        };
    }());

    /*** Login viewModel ***/
    var loginViewModel = (function () {

        var login = function () {

            var username = $('#loginUsername').val(),
                password = $('#loginPassword').val();

            mobileApp.showLoading();

            return el.Users.login(username, password)
            .then(function (data) {
                mobileApp.hideLoading();
                return userModel.load();
            })
            .then(function () {

                mobileApp.navigate('views/favoritesView.html');
            })
            .then(null,
                function (e) {
                    showError(e.message);
                }
            );
        };

        return {
            login: login
        };
    }());
    
    /*** Signup viewModel ***/
    var singupViewModel = (function () {

        var dataSource;

        var signup = function () {

            Everlive.$.Users.register(
                dataSource.Username,
                dataSource.Password,
                dataSource)
            .then(function () {

                showAlert('Registration successful');
                mobileApp.navigate('#welcome');
            })
            .then(null,
                function (e) {
                    showError(e.message);
                }
            );
        };

        var show = function () {

            dataSource = kendo.observable({
                Username: '',
                Password: '',
                DisplayName: '',
                Email: ''
            });

            kendo.bind($('#signup-form'), dataSource, kendo.mobile.ui);
        };

        return {
            show: show,
            signup: signup
        };
    }());

    /*** Favorites Model ***/
    var favoritesModel = (function() {

        var favoriteModel = {

            id: 'Id',
            fields: {
                TwitterID: { field: 'TwitterID', defaultValue: '' },
                ScreenName: { field: 'ScreenName', defaultValue: '' },
                Name: { field: 'Name', defaultValue: '' },
                Avatar: { field: 'Avatar', defaultValue: '' }
            }
        };

        var dataSource = new kendo.data.DataSource({

            type: 'everlive',
            transport: { typeName: 'TwitterUsers' },
            schema: { model: favoriteModel },
            serverFiltering: true,
            change: function(e) {

                if (e.items && e.items.length > 0) {

                    $('#no-favorites-span').hide();

                } else {

                    $('#no-favorites-span').show();
                }
            },
            sort: { field: 'CreatedAt', dir: 'desc' }
        });

        EventsAggregator.bind('user/logged', function(e) {

            dataSource.filter({
                field: 'CreatedBy',
                operator: 'eq',
                value: userModel.currentUser.get('data').Id
            });
        });

        return {
            favorites: dataSource
        };
    }());
    
    /*** Favorites viewModel ***/
    var favoritesViewModel = (function () {

        var currentFavorite = kendo.observable({ data: null });

        var navigateHome = function () {

            mobileApp.navigate('#welcome');
        };

        var logout = function () {

            AppHelper.logout()
            .then(navigateHome, function (e) {

                showError(e.message);
                navigateHome();
            });
        };

        var favoriteSelected = function (e) {
            currentFavorite.set('data', e.data);
            mobileApp.navigate('views/tweetsView.html');
            EventsAggregator.trigger('favorite/selected');
        };

        return {
            favorites: favoritesModel.favorites,
            favoriteSelected: favoriteSelected,
            currentFavorite: currentFavorite,
            logout: logout
        };
    }());

    /*** Manage Favorite viewModel ***/
    var manageFavoritesViewModel = (function () {

        var $searchTwitterUser,
            $searchUsersTemplate,
            $favoritesResultsListview,
            $noResultsSpan,
            listScroller;

        var init = function () {

            $searchTwitterUser = $('#searchTwitterUser');
            $searchUsersTemplate = $('#searchUsersTemplate');
            $favoritesResultsListview = $('#favoritesResultsListview');
            $noResultsSpan = $('#no-results-span');
        };

        var show = function (e) {
            
            listScroller = e.view.scroller;
            listScroller.reset();
        };

        var dataSource = new kendo.data.DataSource({

            transport: {
                read: { url: appSettings.twitterUrl },
                parameterMap: function(options) {
                    return { p: 1, s: 10 };
                }
            },
            schema: {
                model: {
                    id: 'Id',
                    fields: {
                        TwitterID: { type: 'number' },
                        ScreenName: { type: 'text' },
                        Name: { type: 'text' },
                        Avatar: { type: 'text' }
                    },
                    Saved: function () {

                        var TwitterID = this.get('TwitterID'),
                            favorites = favoritesModel.favorites.data(),
                            user = $.grep(favorites, function (e) {
                                return e.TwitterID === TwitterID;
                            })[0];

                        return user ? true : false;
                    }
                },
                parse: function (response) {
                    var users = [],
                        i,
                        len = response.length;

                    for (i = 0; i < len; i++) {
                        var user = {
                            TwitterID: response[i].id,
                            ScreenName: '@' + response[i].screenName,
                            Name: response[i].name,
                            Avatar: response[i].profileImageUrl
                        };
                        users.push(user);
                    }
                    return users;
                }
            },
            requestStart: function (e) {
                mobileApp.showLoading();
            },
            change: function (e) {

                listScroller.reset();

                if (e.items && e.items.length > 0) {

                    $noResultsSpan.hide();

                    $favoritesResultsListview.kendoMobileListView({
                        style: 'inset',
                        dataSource: e.items,
                        template: kendo.template($searchUsersTemplate.html())
                    });

                } else {

                    $noResultsSpan.show();

                    $favoritesResultsListview.empty();
                }

                mobileApp.hideLoading();
            }
        });

        var searchUser = function () {

            var searchTerm = $searchTwitterUser.val();

            dataSource.transport.options.read.url = appSettings.twitterUrl + '?q=' + searchTerm;
            dataSource.read();
        };

        var saveFavorite = function (e) {

            var uid = e.button[0].parentElement.dataset.uid,
                favorites = favoritesModel.favorites,
                data = favorites.data(),
                favorite = dataSource.getByUid(uid),
                currentTwitterID = favorite.TwitterID,
                currentName = favorite.Name,
                i,
                len = data.length;

            for (i = 0; i < len; i++) {

                if (data[i].TwitterID === currentTwitterID) {

                    alert(currentName + ' is already in your favorites list.');
                    return;
                }
            }

            favorites.add(favorite);

            favorites.one('sync', function () {
                mobileApp.navigate('#:back');
            });

            favorites.sync();
            dataSource.fetch();
        };

        var removeFavorite = function (e) {

            var currentUser = userModel.currentUser.get('data').Id,
                uid = e.button[0].parentNode.dataset.uid,
                favorites = favoritesModel.favorites,
                favorite = favorites.getByUid(uid),
                TwitterID = favorite.TwitterID,
                twitterUser = favorite.ScreenName,
                tweets = tweetsModel.tweets;

            var answer = confirm('Are you sure you want to delete user ' + twitterUser);

            if (answer) {

                tweets.fetch(function() {

                    var data = this.data(),
                        item,
                        len = data.length,
                        i;

                    for (i = len - 1; i >= 0; i--) {
                        item = data[i];
                        if (item.CreatedBy === currentUser &&
                            item.TwitterID === TwitterID) {
                            this.remove(item);
                        }
                    }
                    this.sync();
                });

                favorites.remove(favorite);
                favorites.sync();
                dataSource.fetch();
            }
        };

        return {
            init: init,
            show: show,
            source: dataSource,
            saveFavorite: saveFavorite,
            search: searchUser,
            save: saveFavorite,
            remove: removeFavorite
        };
    }());
    
    /*** Tweets Model ***/
    var tweetsModel = (function () {

        var tweetModel = {

            id: 'Id',
            fields: {
                TweetID: { field: 'TweetID', defaultValue: '' },
                Text: { field: 'Text', defaultValue: '' },
                TwitterID: { field: 'TwitterID', defaultValue: '' }
            },
            ScreenName: function () {
                return favoritesViewModel.currentFavorite.get('data').ScreenName;
            },
            Name: function () {
                return favoritesViewModel.currentFavorite.get('data').Name;
            },
            Avatar: function () {
                return favoritesViewModel.currentFavorite.get('data').Avatar;
            }
        };

        var dataSource = new kendo.data.DataSource({

            type: 'everlive',
            transport: { typeName: 'Tweets' },
            schema: { model: tweetModel },
            serverFiltering: true,
            requestStart: function (e) { mobileApp.showLoading(); },
            // requestEnd: function (e) { mobileApp.navigate('views/tweetsView.html'); },
            change: function (e) {

                if (e.items && e.items.length > 0) {

                    $('#no-tweets-span').hide();

                } else {

                    $('#no-tweets-span').show();
                }

                mobileApp.hideLoading();
            },
            sort: { field: 'CreatedAt', dir: 'desc' }
        });

        EventsAggregator.bind('favorite/selected', function () {

            dataSource.query({

                filter: {
                    logic: 'and',
                    filters: [
                        {
                            field: 'CreatedBy',
                            operator: 'eq',
                            value: favoritesViewModel.currentFavorite.get('data').CreatedBy
                        },
                        {
                            field: 'TwitterID',
                            operator: 'eq',
                            value: favoritesViewModel.currentFavorite.get('data').TwitterID
                        }
                    ]
                }
            });
        });

        return {
            tweets: dataSource
        };
    }());
    
    /*** Tweets viewModel ***/
    var tweetsViewModel = (function () {

        var $navBar;

        var init = function () {

            $navBar = $('#tweets-navbar');
        };

        var show = function () {

            var currentFavorite = favoritesViewModel.currentFavorite.get('data').ScreenName;
            $navBar.data('kendoMobileNavBar').title(currentFavorite);
        };

        return {
            init: init,
            show: show,
            tweets: tweetsModel.tweets
        };
    }());

    /*** Manage Tweet viewModel ***/
    var manageTweetsViewModel = (function () {

        var $navBar,
            $tweetsResultsListview,
            $fetchTweetsTemplate,
            $noResultsSpan;

        var init = function () {

            $navBar = $('#tweets-results-navbar');
            $tweetsResultsListview = $('#tweetsResultsListview');
            $fetchTweetsTemplate = $('#fetchTweetsTemplate');
            $noResultsSpan = $('#no-tweets-results-span');
        };

        var show = function () {

            var currentFavorite = favoritesViewModel.currentFavorite.get('data').ScreenName;
            $navBar.data('kendoMobileNavBar').title(currentFavorite);

            return manageTweetsViewModel.fetch();
        };

        var dataSource = new kendo.data.DataSource({

            transport: {
                read: {
                    url: function(options) {
                        return appSettings.twitterUrl + '/';
                    }
                }
            },
            schema: {
                model: {
                    id: 'Id',
                    fields: {
                        TweetID: { type: 'number' },
                        Text: { type: 'text' },
                        TwitterID: { type: 'number' }
                    },
                    ScreenName: function () {
                        return favoritesViewModel.currentFavorite.get('data').ScreenName;
                    },
                    Name: function () {
                        return favoritesViewModel.currentFavorite.get('data').Name;
                    },
                    Avatar: function () {
                        return favoritesViewModel.currentFavorite.get('data').Avatar;
                    },
                    Saved: function () {

                        var TweetID = this.get('TweetID'),
                            tweets = tweetsModel.tweets.data(),
                            user = $.grep(tweets, function (e) {
                                return e.TweetID === TweetID;
                            })[0];

                        return user ? true : false;
                    }
                },
                parse: function (response) {
                    var tweets = [],
                        i,
                        len = response.length;

                    for (i = 0; i < len; i++) {
                        var tweet = {
                            TweetID: response[i].id,
                            Text: response[i].text,
                            TwitterID: response[i].user.id
                        };
                        tweets.push(tweet);
                    }
                    return tweets;
                }
            },
            requestStart: function () {
                mobileApp.showLoading();
            },
            change: function (e) {

                if (e.items && e.items.length > 0) {

                    $noResultsSpan.hide();

                    $tweetsResultsListview.kendoMobileListView({
                        style: 'inset',
                        dataSource: e.items,
                        template: kendo.template($fetchTweetsTemplate.html())
                    });

                } else {

                    $noResultsSpan.show();
                    $tweetsResultsListview.empty();
                }

                mobileApp.hideLoading();
            }
        });

        var fetchTweets = function () {

            var searchTerm = favoritesViewModel.currentFavorite.get('data').ScreenName;

            dataSource.transport.options.read.url = appSettings.twitterUrl + '/' + searchTerm + '/timeline';
            dataSource.read();
        };

        var saveTweet = function (e) {

            var uid = e.button[0].parentElement.dataset.uid,
                tweets = tweetsModel.tweets,
                data = tweets.data(),
                tweet = dataSource.getByUid(uid),
                currentTweetID = tweet.TweetID,
                i,
                len = data.length;

            for (i = 0; i < len; i++) {

                if (data[i].TweetID === currentTweetID) {

                    alert('This tweet is already in your tweets list.');
                    return;
                }
            }

            tweets.add(tweet);
            tweets.sync();
            dataSource.fetch();
        };

        var removeTweet = function (e) {

            var uid = e.button[0].parentNode.dataset.uid,
                tweets = tweetsModel.tweets,
                tweet = tweets.getByUid(uid),
                answer = confirm('Are you sure you want to delete this tweet?');

            if (answer) {
                tweets.remove(tweet);
                tweets.sync();
                dataSource.fetch();
            }
        };

        return {
            init: init,
            show: show,
            tweets: tweetsModel.tweets,
            fetch: fetchTweets,
            save: saveTweet,
            remove: removeTweet
        };
    }());

    return {

        viewModels: {

            login: loginViewModel,
            signup: singupViewModel,
            favorites: favoritesViewModel,
            manageFavorites: manageFavoritesViewModel,
            tweets: tweetsViewModel,
            manageTweets: manageTweetsViewModel
        }
    };

}());