angular.module('arraysApp')
    .controller('DatasetDataCtrl', ['$scope', '$state', '$q', 'DatasetService', 'AuthService', '$mdToast', '$filter', 'dataset', 'additionalDatasources', 'availableTypeCoercions', 'availableDesignatedFields',
        'modalService',
        function ($scope, $state, $q, DatasetService, AuthService, $mdToast,  $filter, dataset, additionalDatasources, availableTypeCoercions, 
            availableDesignatedFields,modalService) {
            $scope.$parent.$parent.currentNavItem = 'data';



            $scope.availableTypeCoercions = availableTypeCoercions;
            // Assert some of the fields should be available
            if (!dataset.raw_rowObjects_coercionScheme) dataset.raw_rowObjects_coercionScheme = {};

            // include all fields (false) if new dataset
            if (!dataset.fe_excludeFields) {
                dataset.fe_excludeFields = {};
                for (var i = 0; i < dataset.columns.length; i++) {
                    dataset.fe_excludeFields[dataset.columns[i].name.replace(".","")] = false;
                }
                $scope.excludeAll = true; // set toggle to "Exclude All"
            } else {
                $scope.excludeAll = false; // check if any fields are included, if not, set button to "Include All"
                for (var i = 0; i < dataset.columns.length; i++) {
                    if(!dataset.fe_excludeFields[dataset.columns[i].name]){
                        $scope.excludeAll = true; // at least one included, set toggle to "Exclude All"
                        break;
                    }
                }
            }

            $scope.primaryAction.text = 'Next';
            $scope.$watch('vm.dataForm.$valid', function(validity) {
                if (validity !== undefined) {

                    $scope.formValidity = validity;
                    if (dataset.connection) {

                        $scope.primaryAction.disabled = false;
                    } else {
                         $scope.primaryAction.disabled = !validity;
                    }

                }
            });

            $scope.$watch('submitting',function(sub) {
                $scope.primaryAction.disabled = (sub == true);
            })
            
            $scope.primaryAction.do = function() {
                $scope.submitForm($scope.formValidity);
            };

            if (!dataset.fe_displayTitleOverrides) dataset.fe_displayTitleOverrides = {};
            if (!dataset.fe_designatedFields) dataset.fe_designatedFields = {};

            $scope.$parent.$parent.dataset = angular.copy(dataset);
            $scope.$parent.$parent.additionalDatasources = angular.copy(additionalDatasources);

            $scope.data = {};

            $scope.availableTypeCoercions = availableTypeCoercions;

            $scope.setDirty = function(number) {
                if ($scope.$parent.$parent.dataset.dirty == 0 && number > 0) {
                    $scope.$parent.$parent.dataset.dirty = number;
                }
            };

            


            var joinDataCols = [];


            if ($scope.$parent.$parent.dataset.connection && $scope.$parent.$parent.dataset.connection.join 
                && $scope.$parent.$parent.dataset.connection.join.tableName) {

                DatasetService.colsForJoinTables($scope.$parent.$parent.dataset._id,$scope.$parent.$parent.dataset.connection)
                .then(function(response) {

                    if (response.status == 200 && response.data) {
                        joinDataCols = response.data;
                        $scope.loadJoinCols();
                    }
                })
            }




            $scope.loadJoinCols = function() {

                if ($scope.$parent.$parent.dataset.connection.join  && joinDataCols) {
                    $scope.data.fields = $scope.originalFields.concat(joinDataCols);
                } else {
                    $scope.data.fields = $scope.originalFields;
                }
            }

            



            $scope.toggleExclude = function (exclude) {
                for (var i = 0; i < $scope.originalFields.length; i++) {
                    $scope.dataset.fe_excludeFields[$scope.originalFields[i].name] = exclude;
                }
                $scope.excludeAll = exclude ? false : true; // toggle
            };

            $scope.openJoinTablesDialog = function() {
                var data = {
                    dataset: $scope.$parent.$parent.dataset,
                    DatasetService: DatasetService
                }

                modalService.openDialog('joinTable',data)
                .then(function(savedDataset) {
                     joinDataCols = savedDataset.joinCols;
                     delete savedDataset.joinCols;
                     $scope.$parent.$parent.dataset = savedDataset;
                     $scope.loadJoinCols();
                })

            }

            $scope.openFieldDialog = function (fieldName, firstRecord, custom, customFieldIndex, filterOnly) {

                var data = {
                    fieldName: fieldName,
                    firstRecord: firstRecord,
                    dataset: $scope.$parent.$parent.dataset,
                    availableTypeCoercions: availableTypeCoercions,
                    availableDesignatedFields: availableDesignatedFields,
                    custom: custom,
                    customFieldIndex: customFieldIndex,
                    filterOnly: filterOnly
                }

                modalService.openDialog('field',data)
                .then(function(savedDataset) {
                    $scope.$parent.$parent.dataset = savedDataset;

                    if (Object.keys(savedDataset.fe_designatedFields).length > 0) {

                        for (var key in savedDataset.fe_designatedFields) {
                            $scope.data.fe_designatedFields[key] = savedDataset.fe_designatedFields[key];
                        }
                    }
                    $scope.coercionScheme = angular.copy(savedDataset.raw_rowObjects_coercionScheme);
                    sortColumnsByDisplayOrder();

                    $scope.vm.dataForm.$setDirty();

                    if(filterOnly) {
                        $scope.openFabricatedFilterDialog();
                    }
                },function() {

                    if(filterOnly) {
                        $scope.openFabricatedFilterDialog();
                    }
                })

            };

            $scope.openNestedDialog = function () {

                var data =  {
                    dataset: $scope.$parent.$parent.dataset,
                    additionalDatasources: $scope.$parent.$parent.additionalDatasources
                }

                modalService.openDialog('nested',data)
                .then(function(savedDataset) {

                    $scope.$parent.$parent.dataset = result.dataset;
                    $scope.$parent.$parent.additionalDatasources = result.additionalDatasources;

                    $scope.coercionScheme = angular.copy(result.dataset.raw_rowObjects_coercionScheme);
                    sortColumnsByDisplayOrder();

                    $scope.vm.dataForm.$setDirty();
                    
                },function() {
                    // console.log('You cancelled the nested dialog.');
                })

            };

            $scope.openFabricatedFilterDialog = function () {

                var dataset = $scope.$parent.$parent.dataset;

                var colsAvailable = dataset.columns.map(function(column) {
                    return column.name;
                }).concat(dataset.customFieldsToProcess.map(function(customField) {
                    return customField.fieldName;
                })).concat(dataset.fe_nestedObject.fields.map(function(fieldName) {
                    if (dataset.fe_nestedObject.prefix)
                        return dataset.fe_nestedObject.prefix + fieldName;
                    return fieldName;
                })).concat(dataset.relationshipFields.map(function(field) {
                    return field.field;

                }));

                dataset.imageScraping.map(function(sourceURL) {
                    colsAvailable = colsAvailable.concat(sourceURL.setFields.map(function(field) {
                        return field.newFieldName;
                    }));
                });

        

                var data = {

                    dataset: dataset,
                    colsAvailable: colsAvailable,
                    fields: $scope.originalFields,
                    openFieldDialog: $scope.openFieldDialog

                }

                modalService.openDialog('fabricated',data)
                    .then(function (savedDataset) {
                        $scope.$parent.$parent.dataset = savedDataset;
                        $scope.vm.dataForm.$setDirty();
                    }, function () {
                        // console.log('You cancelled the fabricated filter dialog.');
                    });
            };

            $scope.openImageScrapingDialog = function () {

                var data = {
                    dataset : $scope.$parent.$parent.dataset
                }

                modalService.openDialog('imageScraping',data)
                    .then(function (savedDataset) {
                        $scope.$parent.$parent.dataset = savedDataset;
                        // $scope.data.fe_designatedFields = savedDataset.fe_designatedFields;
                        if (!$scope.data.designatedFields) $scope.data.designatedFields = {};
                        for (var key in $scope.dataset.fe_designatedFields) {
                            $scope.data.designatedFields[$scope.dataset.fe_designatedFields[key]] = key;
                        }

                        sortColumnsByDisplayOrder();
                        $scope.vm.dataForm.$setDirty();
                    }, function () {
                        // console.log('You cancelled the image scraping dialog.');
                    });
            };


            $scope.openJoinDialog = function() {
                var data = {
                    dataset: $scope.$parent.$parent.dataset,
                    fields: $scope.originalFields
                }

                modalService.openDialog('field',data)
                    .then(function (savedDataset) {

                        $scope.$parent.$parent.dataset = savedDataset;
                        sortColumnsByDisplayOrder();

                        $scope.vm.dataForm.$setDirty();
                    }, function () {
                        // console.log('You cancelled the dataset join dialog.');
                    });
            };


            function sortColumnsByDisplayOrder() {

                $scope.data.fields = $scope.originalFields = $scope.$parent.$parent.dataset.columns.concat(
                    $scope.$parent.$parent.dataset.customFieldsToProcess.map(function(customField, index) {


                        if (!$scope.$parent.$parent.dataset.fe_excludeFields[customField.fieldName]) {
                            $scope.$parent.$parent.dataset.fe_excludeFields[customField.fieldName] = false;
                        }

                        return {
                            name: customField.fieldName,
                            sample: null,
                            custom: true,
                            customField: customField,
                            customFieldIndex: index
                        };
                    })
                ).concat(
                    $scope.$parent.$parent.dataset.fe_nestedObject.fields.map(function(field, index) {

                        var fieldName = $scope.$parent.$parent.dataset.fe_nestedObject.prefix + field;

                        if (!$scope.$parent.$parent.dataset.fe_excludeFields[fieldName]) {
                            $scope.$parent.$parent.dataset.fe_excludeFields[fieldName] = false;
                        }

                        return {
                            name: $scope.$parent.$parent.dataset.fe_nestedObject.prefix + field,
                            sample: null,
                            custom: true
                        };

                    })
                ).concat(
                    $scope.$parent.$parent.dataset.imageScraping.reduce(function(imageScraping1, imageScraping2) {
                        var setFields1 = imageScraping1.setFields || [],
                            setFields2 = imageScraping2.setFields || [];


                        return setFields1.map(function(field) {


                            if (!$scope.$parent.$parent.dataset.fe_excludeFields[field.newFieldName]) {
                                $scope.$parent.$parent.dataset.fe_excludeFields[field.newFieldName] = false;
                            }


                            return {
                                name: field.newFieldName,
                                sample: null,
                                custom: true
                            };
                        }).concat(setFields2.map(function(field) {


                            if (!$scope.$parent.$parent.dataset.fe_excludeFields[field.newFieldName]) {
                                $scope.$parent.$parent.dataset.fe_excludeFields[field.newFieldName] = false;

                            }


                            return {
                                name: field.newFieldName,
                                sample: null,
                                custom: true
                            };


                        }));
                    }, [])
                ).concat(
                    $scope.$parent.$parent.dataset.relationshipFields.map(function(relationshipField) {

                        if (!$scope.$parent.$parent.dataset.fe_excludeFields[relationshipField.field]) {
                            $scope.$parent.$parent.dataset.fe_excludeFields[relationshipField.field] = false;
                        }

                        return {
                            name: relationshipField.field,
                            custom: true

                        };
                    })


                );

                $scope.originalFields.sort(function (column1, column2) {
                    if ($scope.$parent.$parent.dataset.fe_fieldDisplayOrder.indexOf(column1.name) == -1 &&
                        $scope.$parent.$parent.dataset.fe_fieldDisplayOrder.indexOf(column2.name) != -1)
                        return 1;
                    else if ($scope.$parent.$parent.dataset.fe_fieldDisplayOrder.indexOf(column2.name) == -1 &&
                        $scope.$parent.$parent.dataset.fe_fieldDisplayOrder.indexOf(column1.name) != -1)
                        return -1;
                    else
                        return $scope.$parent.$parent.dataset.fe_fieldDisplayOrder.indexOf(column1.name) -
                            $scope.$parent.$parent.dataset.fe_fieldDisplayOrder.indexOf(column2.name);
                });


            }

            $scope.fieldSortableOptions = {
                stop: function (e, ui) {
                    $scope.$parent.$parent.dataset.fe_fieldDisplayOrder =
                        $scope.originalFields.map(function (field) {
                            return field.name;
                        });

                    $scope.vm.dataForm.$setDirty();
                },

                disabled: $scope.$parent.$parent.dataset.connection

            };

            $scope.saveRequiredFields = function() {
                $scope.$parent.$parent.dataset.fn_new_rowPrimaryKeyFromRowObject = $scope.data.fn_new_rowPrimaryKeyFromRowObject;
                for(designatedField in $scope.data.fe_designatedFields) {
                        $scope.$parent.$parent.dataset.fe_designatedFields[designatedField] = $scope.data.fe_designatedFields[designatedField];
                }
            };

            $scope.reset = function () {
                $scope.$parent.$parent.dataset = angular.copy(dataset);

                if (!dataset.columns) return;

                $scope.data = {};
                $scope.coercionScheme = angular.copy(dataset.raw_rowObjects_coercionScheme);
                $scope.data.fe_designatedFields = dataset.fe_designatedFields;
                sortColumnsByDisplayOrder();

                if ($scope.vm) $scope.vm.dataForm.$setPristine();
            };

            $scope.changeCoercionSchemeByOperation = function (colName) {
                var coercion = $scope.coercionScheme[colName];

                if ($filter('typeCoercionToString')(coercion) != 'Date') {
                    $scope.$parent.$parent.dataset.raw_rowObjects_coercionScheme[colName] = coercion;
                    $scope.$parent.$parent.dataset.dirty = 1;

                } else {
                    if (!$scope.$parent.$parent.dataset.raw_rowObjects_coercionScheme[colName]) {
                        $scope.$parent.$parent.dataset.raw_rowObjects_coercionScheme[colName] = coercion;

                        $scope.$parent.$parent.dataset.dirty = 1;

                    }

                    else {
                        $scope.$parent.$parent.dataset.raw_rowObjects_coercionScheme[colName].operation = coercion.operation;

                    }

                }
            };

            $scope.reset();

            $scope.data.fe_designatedFields = dataset.fe_designatedFields;

            $scope.submitForm = function (isValid) {
                //Save settings primary key and object title as set in the ui
                $scope.saveRequiredFields();


                if (isValid) {
                    $scope.submitting = true;

                    var errorHandler = function (error) {
                            $scope.submitting = false;
                            $mdToast.show(
                            $mdToast.simple()
                                .textContent(error)
                                .position('top right')
                                .hideDelay(5000)
                        );
                        }, done = function() {  
                            $scope.submitting = false;

                            $mdToast.show(
                            $mdToast.simple()
                                .textContent('Dataset updated successfully!')
                                .position('top right')
                                .hideDelay(3000)
                        );

                            $state.transitionTo('dashboard.dataset.views', {id: dataset._id}, {
                                reload: true,
                                inherit: false,
                                notify: true
                            });
                        };

                    var queue = [];

                    var finalizedDataset = angular.copy($scope.$parent.$parent.dataset);
                    delete finalizedDataset.columns;

                    queue.push(DatasetService.save(finalizedDataset));

                    $scope.$parent.$parent.additionalDatasources.forEach(function(datasource) {
                        var finalizedDatasource = angular.copy(datasource);
                        delete finalizedDatasource.fn_new_rowPrimaryKeyFromRowObject;
                        delete finalizedDatasource.raw_rowObjects_coercionScheme;
                        delete finalizedDatasource._otherSources;
                        delete finalizedDatasource._team;
                        delete finalizedDatasource.title;
                        delete finalizedDatasource.importRevision;
                        delete finalizedDatasource.author;
                        delete finalizedDatasource.updatedBy;
                        delete finalizedDatasource.brandColor;
                        delete finalizedDatasource.customFieldsToProcess;
                        delete finalizedDatasource.urls;
                        delete finalizedDatasource.description;
                        delete finalizedDatasource.fe_designatedFields;
                        delete finalizedDatasource.fe_excludeFields;
                        delete finalizedDatasource.fe_displayTitleOverrides;
                        delete finalizedDatasource.fe_fieldDisplayOrder;
                        delete finalizedDatasource.imageScraping;
                        delete finalizedDatasource.isPublic;
                        delete finalizedDatasource.fe_views;
                        delete finalizedDatasource.fe_filters;
                        delete finalizedDatasource.fe_objectShow_customHTMLOverrideFnsByColumnNames;



                        queue.push(DatasetService.save(finalizedDatasource));
                    });


                    $q.all(queue)
                        .then(done)
                        .catch(errorHandler);
                }
            };

        }
    ]);
