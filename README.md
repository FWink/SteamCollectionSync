# SteamCollectionSync
Synchronizes changes from multiple source workshop collections into one target collection (recursively).

# Usage
Transpile the code and copy the content of the output file bin/sync.js into a browser console (F12). As the script needs to access your personal Steam account currently you will have to login at https://steamcommunity.com and execute the script there. Otherwise the script can't access your session cookies and can't authenticate.

Call the sync method with your parameters:
```
new CollectionSync("Target Collection ID", ["Source Collection ID 1", "Source Collection ID 2"]).sync();
```

You find the ID of your collections in the browser's address bar. For example:
> https://steamcommunity.com/sharedfiles/filedetails/?id=1672014264

## Extras

Instead of syncing (adding __and__ deleting items) there are two further things we can do that come along naturally. They are controlled via the optional "options" constructor parameter:

```
new CollectionSync("Target Collection ID", ["Source Collection ID 1", "Source Collection ID 2"], {

  //no items are deleted from the target collection when true is passed here
  copyOnly: true,
  
  //pass true along with an empty source array to clear all items from the target collection
  clear: true
  
}).sync();
```

# Why?

Personally I'm using the script like this:

I'm hosting a dedicated Garry's mod server running the TTT2 mod. That mod has several different sub mods each with several collection dependencies.
Now the problem is if players want to subscribe to all required items they can't just subscribe to the server's collection and be done. Subscribing to all items in a collection does not work recursively.

So they'll have to subscribe to the server's collection which links to the TTT2 collection which links to several sub collections which again link to sub collections and so on.
That results in a lot of clicking and keeping everyone up-to-date can be tiresome.


Instead I manage three collections:
1. A collection without any items of its own. It links to all TTT2 dependencies
2. A collection with the additional items we've hand picked for our server
3. A collection that we keep in sync with the recursive content of the other two collections

Now the players just need to subscribe to all the items in the third collection. Additionally we can keep the collection with our custom stuff clean of all the standard dependencies which might change at any point, who knows?
