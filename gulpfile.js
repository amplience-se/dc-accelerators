'use strict';

var es = require('event-stream');
var gulp = require('gulp');
var sass = require('gulp-sass');
var rename = require('gulp-rename');
var autoprefixer = require('gulp-autoprefixer');
var cleanCSS = require('gulp-clean-css');
var sourcemaps = require('gulp-sourcemaps');
var handlebars = require('gulp-handlebars');
var declare = require('gulp-declare');
var uglify = require('gulp-uglify');
var htmlmin = require('gulp-htmlmin');
var pump = require('pump');
var processhtml = require('gulp-processhtml');
var del = require('del');
var concat = require('gulp-concat');
var logger = require('gulp-logger');
var fs = require('fs');

var insert = require('gulp-insert');
var addSrc = require('gulp-add-src');

var connect = require('gulp-connect');
var watch = require('gulp-watch');
var config = JSON.parse(fs.readFileSync('private/presales.json'));
var s3 = require('gulp-s3-upload')(config);
var name;

var dependencies = require('./dependencies.json');
var contentDependencies = require('./content_dependencies.json');
var toReplace = require('./.replace.json');

var libName = 'libs';

var excludeReusable = {
    text: '!./dist/reusable/showdown.min.js',
    slider: '!./dist/reusable/lory.js'
};

var reusable = './dist/reusable/*.js';

var replace = function () {
    return es.map(function (file, cb) {
        var fileContent = file.contents.toString();
        fileContent = fileContent.replace(/\{CONTENT_TYPE_BASEPATH\}/g, toReplace.CONTENT_TYPE_BASEPATH);
        file.contents = new Buffer(fileContent);
        // send the updated file down the pipe
        cb(null, file);
    });
};

var replaceVisualization = function () {
    return es.map(function (file, cb) {
        var fileContent = file.contents.toString();
        fileContent = fileContent.replace(/\{VISUALIZATION_BASEPATH\}/g, toReplace.VISUALIZATION_BASEPATH);
        fileContent = fileContent.replace(/\{COMPANY_TAG\}/g, toReplace.COMPANY_TAG);
        file.contents = new Buffer(fileContent);
        cb(null, file);
    });
}

gulp.task('addContentTypes', ['build'], function (cb) {
    for (var module in dependencies) {
        // var moduleName = module.toLowerCase();
       var moduleName = module;
       console.log('module: ', moduleName);
        gulp.
          src([
          './node_modules/dc-accelerators-content-types/*' + moduleName + '.json',
          './node_modules/dc-accelerators-content-types/**/' + moduleName + '.json',
          './node_modules/dc-accelerators-content-types/products/**/' + moduleName + '.json'
        ])
            .pipe(replace())
            .pipe(
                gulp.dest('./dist/contentTypes/')
            )

        if (contentDependencies[module]) {
            contentDependencies[module].forEach(function (dependency) {
              console.log('dependency: ', dependency);
                gulp.
                  src([
                    './node_modules/dc-accelerators-content-types/' + dependency + '.json',
                    './node_modules/dc-accelerators-content-types/**/' + dependency + '.json',
                  './node_modules/dc-accelerators-content-types/products/**/' + dependency + '.json',
                ])
                    .pipe(replace())
                    .pipe(
                        gulp.dest('./dist/contentTypes/')
                    )
            });
        }
    }

    setTimeout(function(){
        cb(null);
    }, 500)

});

gulp.task("upload-content-types", function() {
  gulp.src("./dist/contentTypes/**")
    .pipe(s3({
        Bucket: 'presalesadisws/demo/maic/baja/dist/contentTypes', //  Required
        ACL:    'public-read'       //  Needs to be user-defined
      },
      {
        // S3 Constructor Options, ie:
        maxRetries: 5
      }));
});

gulp.task("upload-icons", function() {
  gulp.src("./dist/icons/**")
    .pipe(s3({
        Bucket: 'presalesadisws/demo/maic/baja/dist/icons', //  Required
        ACL:    'public-read'       //  Needs to be user-defined
      },
      {
        // S3 Constructor Options, ie:
        maxRetries: 5
      }));
});

gulp.task('update-content-types', function() {
  gulp.src("./dist/contentTypes/**")
    .pipe(gulp.dest('../content-types/Accelerators'));
});

gulp.task('addDependencies', ['build', 'addContentTypes'], function () {
    for (var module in dependencies) {
        var fullReusable = [reusable];
        for (var res in excludeReusable) {
            fullReusable.push(excludeReusable[res]);
        }

        if (excludeReusable[module]) {
            fullReusable.splice(fullReusable.indexOf(excludeReusable[module]), 1);
        }

        dependencies[module].forEach(function (currentDependency) {
            if (excludeReusable[currentDependency]) {
                fullReusable.splice(
                    fullReusable.indexOf(excludeReusable[currentDependency]),
                    1
                );
            }
            gulp
                .src([
                    './dist/renders/' + currentDependency + '/package/**/*'
                ])
                .pipe(
                    gulp.dest(
                        './dist/renders/' +
                        module +
                        '/package/dependencies/' +
                        currentDependency
                    )
                );
        });

        gulp
            .src(fullReusable)
            .pipe(gulp.dest('./dist/renders/' + module + '/package/' + libName));
    }
});

gulp.task('minifyPack', ['build'], function () {
    for (var mod in dependencies) {
        (function () {
            let module = mod;
            let css = [
                './dist/renders/' + module + '/package/' + module + '.min.css'
            ];
            let compiledTemplates = [
                './dist/renders/' + module + '/' + module + '.min.js'
            ];
            let fullReusable = [reusable, './src/renders/' + module + '/js/*.js'];

            for (var res in excludeReusable) {
                fullReusable.push(excludeReusable[res]);
            }

            if (excludeReusable[module]) {
                fullReusable.splice(fullReusable.indexOf(excludeReusable[module]), 1);
            }

            dependencies[module].forEach(function (currentDependency) {
                css.push(
                    './dist/renders/' +
                    currentDependency +
                    '/package/' +
                    currentDependency +
                    '.min.css'
                );
                compiledTemplates.push(
                    './dist/renders/' +
                    currentDependency +
                    '/' +
                    currentDependency +
                    '.min.js'
                );
                fullReusable.push('./src/renders/' + currentDependency + '/js/*.js');

                if (excludeReusable[currentDependency]) {
                    fullReusable.splice(
                        fullReusable.indexOf(excludeReusable[currentDependency]),
                        1
                    );
                }
            });

            gulp
                .src(fullReusable)
                .pipe(uglify())
                .pipe(concat('libs.min.js'))
                .pipe(
                    rename(function (path) {
                        path.dirname = 'renders/' + module + '/min';
                    })
                )
                .pipe(gulp.dest('dist'));

            gulp
                .src(compiledTemplates)
                .pipe(concat('templates.min.js'))
                .pipe(
                    rename(function (path) {
                        path.dirname = 'renders/' + module + '/min';
                    })
                )
                .pipe(gulp.dest('dist'));

            gulp
                .src(css)
                .pipe(cleanCSS())
                .pipe(concat('styles.min.css'))
                .pipe(
                    rename(function (path) {
                        path.dirname = 'renders/' + module + '/min';
                    })
                )
                .pipe(gulp.dest('dist'));
        })();
    }
});

gulp.task('concatAll', ['build'], function () {
    gulp
        .src(['./dist/renders/*/acc-template-*'])
        .pipe(concat('templates.min.js'))
        .pipe(gulp.dest('./dist/renders/all'));

    gulp
        .src([
            './dist/reusable/*.js',
            './src/renders/slider/js/sliderHelper.js',
            '!./dist/reusable/lory.min.js',
            '!./dist/reusable/showdown.min.js'
        ])
        .pipe(uglify())
        .pipe(
            addSrc.append([
                './dist/reusable/lory.min.js',
                './dist/reusable/showdown.min.js'
            ])
        )
        .pipe(concat('libs.min.js'))
        .pipe(gulp.dest('./dist/renders/all'));

    gulp
        .src(['./dist/renders/*/*.min.css'])
        .pipe(concat('styles.min.css'))
        .pipe(gulp.dest('./dist/renders/all'));
});

gulp.task('del', function () {
    return del.sync(['dist']);
});

gulp.task('renders-html', function () {
  return (
    gulp
      .src([
        'src/renders/**/*.html',
        '!src/renders/*/templates/*.html',
        '!src/renders/**/visualisation.html',
        '!src/renders/**/visualization.html',
        '!src/renders/**/visualization*.html'
      ])
      .pipe(processhtml())
      //.pipe(htmlmin({collapseWhitespace: true}))
      .pipe(gulp.dest('dist/renders'))
  );
});

gulp.task('render-sass', function () {
  console.log('Render Saas!');
  return (
    gulp.src('src/renders/**/*.+(scss|sass)') // Gets all files ending with .scss or .sass in src/renders
      .pipe(
        sass({
          outputStyle: 'expanded'
        }).on('error', sass.logError)
      )
      .pipe(
        autoprefixer({
          browsers: ['last 2 versions'],
          cascade: false
        })
      )
      .pipe(
        rename(function (path) {
          name = path.dirname.slice(0, path.dirname.indexOf('sass') - 1);
          path.dirname = name + '/package';
          path.basename = name;
          console.log(path.dirname);
        })
      )
      .pipe(concat('styles.css'))
      //.pipe(gulp.dest('dist/renders'))
      // .pipe(sourcemaps.init())
      //.pipe(cleanCSS())
      // .pipe(sourcemaps.write())
      //.pipe(
      //    rename(function (path) {
      //        name = path.dirname.slice(0, path.dirname.indexOf('package') - 1);
      //        path.dirname = name;
      //        path.basename = name + '.min';
      //    })
      //)
      .pipe(gulp.dest('dist/renders'))
      .pipe(
        rename(function (path) {
          path.dirname = path.dirname + '/package';
        })
      )
    //.pipe(gulp.dest('dist/renders'))
  );
});

gulp.task('renders-sass', function () {
  console.log('Renders Saas!');
  return (
    gulp.src('src/renders/**/*.+(scss|sass)') // Gets all files ending with .scss or .sass in src/renders
      .pipe(
        sass({
          outputStyle: 'expanded'
        }).on('error', sass.logError)
      )
      .pipe(
        autoprefixer({
          browsers: ['last 2 versions'],
          cascade: false
        })
      )
      .pipe(
        rename(function (path) {
          name = path.dirname.slice(0, path.dirname.indexOf('sass') - 1);
          path.dirname = name + '/package';
          path.basename = name;
        })
      )
      .pipe(gulp.dest('dist/renders'))
      // .pipe(sourcemaps.init())
      .pipe(cleanCSS())
      // .pipe(sourcemaps.write())
      .pipe(
        rename(function (path) {
          name = path.dirname.slice(0, path.dirname.indexOf('package') - 1);
          path.dirname = name;
          path.basename = name + '.min';
        })
      )
      .pipe(gulp.dest('dist/renders'))
      .pipe(
        rename(function (path) {
          path.dirname = path.dirname + '/package';
        })
      )
      .pipe(gulp.dest('dist/renders'))
  );
});

gulp.task('renders-templates', function () {
    return gulp
        .src('src/renders/**/templates/*.hbs')
        .pipe(
            rename(function (path) {
                name = path.dirname.slice(0, path.dirname.indexOf('templates') - 1);
                path.dirname = name + '/package';
            })
        )
        .pipe(gulp.dest('dist/renders'))
        .pipe(
            handlebars({
                handlebars: require('handlebars')
            })
        )
        .pipe(
            declare({
                namespace: 'AmpCa.templates'
            })
        )
        .pipe(uglify())
        .pipe(
            rename(function (path) {
                name = path.dirname.slice(0, path.dirname.indexOf('package') - 1);
                path.dirname = name;
                path.basename = path.basename + '.min';
            })
        )
        .pipe(gulp.dest('dist/renders'));
});

gulp.task('copy-icons', function () {
    return gulp
        .src([
            'src/icons/**'
        ])
        .pipe(gulp.dest('dist/icons'));
});

gulp.task('renders-js-copy', function () {
    return gulp
        .src(['src/renders/**/js/*.js'])
        .pipe(
            rename(function (path) {
                name = path.dirname.slice(0, path.dirname.indexOf('js') - 1);
                path.dirname = name + '/package';
            })
        )
        .pipe(gulp.dest('dist/renders'));
});


gulp.task('renders-files-copy', function () {
  return gulp
    .src([
      'src/renders/**/visualisation.html',
      'src/renders/**/visualization.html',
      'src/renders/**/visualization*.html',
      'src/renders/**/visualisation*.html',
      'src/renders/**/templates/*.html'
    ])
    .pipe(
      rename(function (path) {
        var name = path.dirname.replace('/templates', '');
        path.dirname = name + '/package';
      })
    )
    .pipe(gulp.dest('dist/renders'));
});

gulp.task('renders-js-min', function (cb) {
    pump(
        [
            gulp.src(['src/renders/**/js/*.js']),
            //uglify(),
            rename(function (path) {
                name = path.dirname.slice(0, path.dirname.indexOf('js') - 1);
                path.dirname = name;
                path.basename = path.basename;
                //+ '.min';
            }),
            gulp.dest('dist/renders')
        ],
        cb
    );
});

gulp.task('reusable-js-min', function (cb) {
    pump(
        [
            gulp.src(['src/**/js/*.js']),
            //uglify(),
            rename(function (path) {
                name = path.dirname.slice(0, path.dirname.indexOf('js') - 1);
                path.dirname = name;
                path.basename = path.basename;
            }),
            gulp.dest('dist')
        ],
        cb
    );
});
gulp.task('copy-node-modules', function () {
    return gulp
        .src([
            'node_modules/cms-javascript-sdk/dist/cms-javascript-sdk.min.js',
            'node_modules/handlebars/dist/handlebars.min.js',
            'node_modules/showdown/dist/showdown.min.js',
            'node_modules/lory.js/dist/lory.min.js'
        ])
        .pipe(gulp.dest('dist/reusable'));
});

gulp.task('copy-fonts',function(){
  console.log("Moving fonts into dist folder");
  return gulp
    .src(['src/renders/**/*.woff2',
      'src/renders/**/*.eot',
      'src/renders/**/*.ttf'
    ], {base: './src/'})
    .pipe(gulp.dest('dist/'));
});

gulp.task('addLoryLicense', ['copy-node-modules'], function () {
    return gulp
        .src('node_modules/lory.js/LICENSE')
        .pipe(insert.prepend('/*'))
        .pipe(insert.append('*/'))
        .pipe(addSrc.append('dist/reusable/lory.min.js'))
        .pipe(concat('lory.min.js'))
        .pipe(gulp.dest('dist/reusable'));
});

gulp.task('addShowdownLicense', ['copy-node-modules'], function () {
    return gulp
        .src('node_modules/showdown/license.txt')
        .pipe(insert.prepend('/*'))
        .pipe(insert.append('*/'))
        .pipe(addSrc.append('dist/reusable/showdown.min.js'))
        .pipe(concat('showdown.min.js'))
        .pipe(gulp.dest('dist/reusable'));
});

gulp.task('copy-viewer-kit-modules', function () {
    return gulp
        .src([
            'bower_components/jquery-ui/ui/jquery.ui.core.js',
            'bower_components/jquery-ui/ui/jquery.ui.widget.js',
            'node_modules/amplience-sdk-client/dist/video-js/video.min.js',
            'node_modules/amplience-sdk-client/dist/amplience-sdk-client.js'
        ])
        .pipe(gulp.dest('src/pdp/js'));
});

gulp.task(
    'renders-build',
    [
        'renders-html',
        'render-sass',
        'renders-sass',
        'renders-templates',
        'renders-js-copy',
        'renders-files-copy',
        'renders-js-min'
    ],
    function () {
    }
);

gulp.task(
    'build',
    [
        'del',
        'renders-build',
        'copy-node-modules',
        'copy-fonts',
        'copy-icons',
        'addLoryLicense',
        'addShowdownLicense',
        'reusable-js-min'
    ],
    function () {
    }
);

gulp.task('buildAllWithoutReload', ['build', 'addDependencies', 'addContentTypes', 'concatAll']);

gulp.task('buildAll', ['buildAllWithoutReload'], function () {
    return gulp.src('*').pipe(connect.reload());
});

gulp.task(
    'buildAllMin',
    ['build', 'addDependencies', 'addContentTypes', 'minifyPack', 'server'],
    function () {
        return gulp.src('*').pipe(connect.reload());
    }
);

gulp.task('server', function () {
    return connect.server({
        port: 3000,
        hostname: '0.0.0.0',
        livereload: true,
        debug: true
    });
});

gulp.task('watch', ['buildAll'], function () {
    return watch(['./src/**/*'], function () {
        gulp.start('buildAll');
    });
});

gulp.task('default', ['watch', 'server']);
