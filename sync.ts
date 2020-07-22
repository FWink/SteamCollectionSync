class CollectionSync {

    private targetCollectionId: string;
    private sourceCollectionIds: string[];

    private sourceCollectionsRequested: string[] = [];

    public constructor(targetCollectionId: string, sourceCollectionIds: string[]) {
        this.targetCollectionId = targetCollectionId;
        this.sourceCollectionIds = sourceCollectionIds;
    }

    public sync(): Promise<any> {
        //step 1: fetch
        let itemsTarget: PublishedFileDetails[];
        let itemsSource: PublishedFileDetails[];

        let promisesFetch: Promise<any>[] = [];

        promisesFetch.push(this.getCollectionItems(this.targetCollectionId).then(items => itemsTarget = items));
        promisesFetch.push(this.getCollectionItems(...this.sourceCollectionIds).then(items => itemsSource = items));

        return Promise.all(promisesFetch).then(() => {

            //step 2: diff
            let diffs = this.diffItems(itemsTarget, itemsSource);
            let promisesModify: Promise<any>[] = [];

            //step 3: modify
            for(let diff of diffs) {
                if(diff.add)
                    promisesModify.push(this.addToCollection(this.targetCollectionId, diff.item.publishedfileid));
                else
                    promisesModify.push(this.removeFromCollection(this.targetCollectionId, diff.item.publishedfileid));
            }

            return Promise.all(promisesModify);
        });
    }

    //#region Modify Collection

    /**
     * Adds an item to a collection.
     * @param collectionId 
     * @param itemId 
     */
    protected addToCollection(collectionId: string, itemId: string): Promise<any> {
        return this.query("https://steamcommunity.com/sharedfiles/addchild", [
            {
                key: "id",
                value: collectionId
            },
            {
                key: "childid",
                value: itemId
            },
            {
                key: "sessionid",
                value: this.getSessionId()
            }
        ]);
    }

    /**
     * Removes an item from a collection.
     * @param collectionId 
     * @param itemId 
     */
    protected removeFromCollection(collectionId: string, itemId: string): Promise<any> {
        return this.query("https://steamcommunity.com/sharedfiles/removechild", [
            {
                key: "id",
                value: collectionId
            },
            {
                key: "childid",
                value: itemId
            },
            {
                key: "sessionid",
                value: this.getSessionId()
            }
        ])
        .then(response => {
            let result: RemoveChildResult = JSON.parse(response);

            if(result.success != 1) {
                throw new Error(`removechild returned success: ${result.success}`)
            }
        })
    }

    /**
     * Returns the "sessionid" parameter (=cookie) of the current browser session.
     * It is required to add items to/remove items from a collection.
     */
    protected getSessionId(): string {
        let match = document.cookie.match(/sessionid=([^;]+)/);
        if(match)
            return match[1];
        return "";
    }

    //#endregion

//#region Diff
    /**
     * Returns the difference of the two given sets.
     * {@link ItemDiff#add} is true when that item is in items2 but not in items1.
     * @param items1 
     * @param items2 
     */
    protected diffItems(items1: PublishedFileDetails[], items2: PublishedFileDetails[]): ItemDiff[] {
        return this.diffItemsHelp(items1, items2, false).concat(
            this.diffItemsHelp(items2, items1, true)
        );
    }

    /**
     * Returns items of item1 that are not included in item2
     * @param items1 
     * @param items2 
     * @param add See {@link diffItems}: whether to set "add" true or false
     */
    protected diffItemsHelp(items1: PublishedFileDetails[], items2: PublishedFileDetails[], add: boolean): ItemDiff[] {

        let diff: ItemDiff[] = [];

        for(let item1 of items1) {
            let contained = false;

            for(let item2 of items2) {
                if(item1.publishedfileid == item2.publishedfileid) {
                    contained = true;
                    break;
                }
            }

            if(!contained) {
                diff.push({
                    item: item1,
                    add: false
                });
            }
        }

        return diff;
    }

//#endregion

//#region Get Collection Items

    /**
     * Returns all items in the given collection(s).
     * If the collections contain collections then their items are returned as well.
     * If all the collection have been queried already then an empty array is returned.
     */
    protected getCollectionItems(...collectionIds: string[]): Promise<PublishedFileDetails[]> {

        let allQueried = true;
        for(let collectionId of collectionIds) {
            if(!this.isCollectionQueried(collectionId)) {
                allQueried = false;
                break;
            }
        }
        if(allQueried)
            return Promise.resolve([]);

        this.sourceCollectionsRequested.push(...collectionIds);

        return this.query("https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/", [
            {
                key: "collectioncount",
                value: collectionIds.length
            },
            {
                key: "publishedfileids",
                value: collectionIds,
                isArray: true
            }
        ])
        .then(response => {

            let result: GetCollectionDetailsResult = JSON.parse(response);

            if(result.response.result != 1) {
                throw new Error(`GetCollectionDetails returned status: ${result.response.result}`)
            }

            let items: PublishedFileDetails[] = [];
            let subCollections: string[] = [];

            for(let collection of result.response.collectiondetails) {

                if(collection.result != 1) {
                    throw new Error(`GetCollectionDetails returned status '${result.response.result}' for collection: ${collection.publishedfileid}`)
                }

                for(let child of collection.children) {

                    if(child.filetype == PublishedFileType.COLLECTION) {
                        subCollections.push(child.publishedfileid);
                    }
                    else {
                        items.push(child);
                    }
                }
            }

            return this.getCollectionItems(...subCollections).then(subItems => {

                return items.concat(subItems);
            });
        });
    }

    /**
     * Return true when the given collection has been queried already;
     * we do not need to query its content again.
     * @param collectionId 
     */
    protected isCollectionQueried(collectionId: string): boolean {
        return this.sourceCollectionsRequested.includes(collectionId);
    }

    //#endregion

    //#region HTTP

    /**
     * Executes an HTTP call.
     * @param url 
     * @param parameters 
     */
    protected query(url: string, parameters: RequestParameter[]): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            const request = new XMLHttpRequest();
            request.open("POST", url);
            request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

            request.onreadystatechange = () => {
                if(request.readyState == XMLHttpRequest.DONE) {
                    if(request.status == 200) {
                        resolve(request.response);
                    }
                    else if(request.status == 302) {
                        resolve("");
                    }
                    else {
                        reject({
                            status: request.status,
                            text: request.response
                        });
                    }
                }
            }

            request.onerror = request.ontimeout = request.onabort = reject;

            request.send(this.buildQueryParameters(parameters));
        });
    }

    /**
     * Converts the given parameters into a "x-www-form-urlencoded" query string
     * @param parameters 
     */
    protected buildQueryParameters(parameters: RequestParameter[]): string {

        let query = "";

        for(const param of parameters) {

            if(param.isArray || this.parametersIsArray(param.value)) {

                let values: any[];

                if(this.parametersIsArray(param.value)) {
                    values = param.value;
                }
                else {
                    values = [param.value];
                }

                for(let i = 0; i < values.length; ++i) {
                    query = this.buildQueryParameter(query, param.key + `[${i}]`, values[i]);
                }
            }
            else {
                const value: number|string = <any> param.value;
                query = this.buildQueryParameter(query, param.key, value);
            }
        }

        return query;
    }

    /**
     * Adds a single key-value pair to the given query string.
     * @param query 
     * @param key 
     * @param value 
     */
    protected buildQueryParameter(query: string, key: string, value: string|number): string {

        if(query.length > 0)
            query += "&";

        return query + encodeURIComponent(key) + "=" + encodeURIComponent(value);
    }

    /**
     * Returns true if the given parameter is an array (see {@link RequestParameter#value})
     * @param value 
     */
    protected parametersIsArray(value: any): value is [] {
        return value instanceof Array;
    }

    //#endregion
}

interface GetCollectionDetailsResult {
    response: {
        result: number,
        resultcount: number,
        collectiondetails: CollectionDetails[]
    }
}

interface CollectionDetails {
    result: number
    publishedfileid: string,
    children: PublishedFileDetails[]
}

interface PublishedFileDetails {
    publishedfileid: string,
    sortorder: number,
    filetype: PublishedFileType
}

enum PublishedFileType {
    ITEM = 0,
    COLLECTION = 2
}

interface RequestParameter {
    key: string,
    value: string|number|string[]|number[],
    isArray?: boolean
}

interface ItemDiff {
    item: PublishedFileDetails,
    add: boolean
}

interface RemoveChildResult {
    success: number
}