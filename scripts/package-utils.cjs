const isPackageSuccess = (status, artifactExists) => status === 0 && artifactExists;

module.exports = { isPackageSuccess };
