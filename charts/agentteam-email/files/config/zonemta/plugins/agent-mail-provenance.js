"use strict";

module.exports.title = "Agent Mail Provenance";

module.exports.init = (app, done) => {
    app.addHook("sender:headers", (delivery, connection, next) => {
        delivery.headers.add("X-Agent-Mail-ZoneMTA-Queue-ID", delivery.id, 0);
        next();
    });

    done();
};
