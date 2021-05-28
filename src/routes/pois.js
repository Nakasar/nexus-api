const { nanoid } = require("nanoid/async");

class PoisRouter {
  constructor({ mongoClient, firebaseClient }) {
    this.mongoClient = mongoClient;
    this.firebaseClient = firebaseClient;
  }

  init(router) {
    router.post("/", async (req, res, next) => {
      try {
        return res.status(201).json({
          message: 'OK'
        });
      } catch (error) {
        next(error);
      }
    });
    
    router.post("/:poiId/images", async (req, res, next) => {
      try {
        const imageId = await nanoid();
        const [signedUrl] = await this.firebaseClient.storage().bucket('gs://nexuscorp-b99de.appspot.com')
          .file(`pois/${req.params.poiId}/images/${imageId}.png`)
          .getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
            contentType: 'image/png',
          });
        
        
        return res.status(201).json({
          id: imageId,
          url: signedUrl,
        });
      } catch (error) {
        next(error);
      }
    });

    return router;
  }
}

module.exports = { PoisRouter };
