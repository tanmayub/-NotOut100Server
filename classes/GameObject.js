class GameObject {
    GameId;
    PlayerList;
    PlayerCt;

    constructor(GameId, PlayerList) {
        this.GameId = GameId;
        this.PlayerList = PlayerList;
        this.PlayerCt = 1;
    }
}

module.exports.GameObject = GameObject;